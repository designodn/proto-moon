#!/usr/bin/env node
/**
 * upload.mjs — «Обновление контента»: страница для дизайнеров + загрузка медиа.
 *
 * Зачем: дизайнеры сами наполняют прототип через Google-таблицу. Внешние
 * картинки задаются ссылкой, но СВОИ картинки и клипы ссылки не имеют — их
 * некуда было положить, кроме как руками в репо. Этот модуль даёт раздел
 * /content на развилочной, где дизайнер:
 *   1) открывает таблицу для редактирования,
 *   2) заливает свой файл и получает готовый URL для вставки в таблицу,
 *   3) видит короткую инструкцию.
 *
 * Файлы уходят в отдельный S3-бакет (Yandex Object Storage). В репо они НЕ
 * попадают: media-cache (scripts/lib/media-cache.mjs) пропускает ссылки на наш
 * бакет как есть (см. UPLOADS_PUBLIC_BASE), а не качает их в assets/.
 *
 * Подключается из server.mjs: маршруты GET /content и POST /api/upload.
 *
 * Переменные окружения (значения задаёт владелец прототипа):
 *   UPLOADS_BUCKET            — имя бакета для загрузок (обязательно)
 *   UPLOADS_ACCESS_KEY_ID     — статический ключ S3 (или AWS_ACCESS_KEY_ID)
 *   UPLOADS_SECRET_ACCESS_KEY — секрет S3 (или AWS_SECRET_ACCESS_KEY)
 *   UPLOADS_ENDPOINT          — endpoint S3 (по умолчанию storage.yandexcloud.net)
 *   UPLOADS_REGION            — регион (по умолчанию ru-central1)
 *   UPLOADS_PREFIX            — префикс ключей в бакете (по умолчанию пусто)
 *   UPLOADS_PUBLIC_BASE       — публичная база URL для отдачи файлов
 *                               (по умолчанию https://<bucket>.storage.yandexcloud.net/)
 *   UPLOAD_PASSWORD           — общий пароль на загрузку (без него — открыто; задайте!)
 *   SHEET_EDIT_URL            — ссылка на таблицу для кнопки «Редактировать»
 */

import { isUploadConfigured, putContentAddressed } from './scripts/lib/bucket.mjs';
import { compressImage } from './scripts/lib/media-cache.mjs';

export { isUploadConfigured };

const DEFAULT_SHEET =
  'https://docs.google.com/spreadsheets/d/1Ctwjp2J0HSmvb6kL4NoDqaB9W4QfdAXXDnzyBDLYZ7Y/edit';

const MAX_BYTES = 200 * 1024 * 1024; // 200 МБ — с запасом под клипы

/** UI-конфиг страницы (пароль + ссылка на таблицу). Бакет — в lib/bucket.mjs. */
function uiCfg() {
  return {
    password: process.env.UPLOAD_PASSWORD || '',
    sheetUrl: process.env.SHEET_EDIT_URL || DEFAULT_SHEET,
  };
}

/** Расширение по mime, фолбэк — по имени файла. */
function extFor(mime, name) {
  const map = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  };
  const ct = (mime || '').toLowerCase();
  for (const k in map) if (ct.startsWith(k)) return map[k];
  const m = (name || '').toLowerCase().match(/\.([a-z0-9]{2,4})$/);
  return m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : 'bin';
}

/** Читает тело запроса в буфер с лимитом. */
async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const err = new Error('too large');
      err.tooLarge = true;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};

/**
 * POST /api/upload — тело = сырые байты ОДНОГО файла (по файлу на запрос).
 * Параметры в query: name, type (mime), compress ('1'|'0'). Пароль — в заголовке
 * x-upload-password. Возвращает { url, key, bytes }.
 */
export async function handleUploadApi(req, res) {
  const { password } = uiCfg();
  if (!isUploadConfigured()) {
    return json(res, 503, { error: 'Хранилище не настроено: задайте env UPLOADS_BUCKET и ключи S3.' });
  }
  if (password && req.headers['x-upload-password'] !== password) {
    return json(res, 401, { error: 'Неверный пароль.' });
  }

  const url = new URL(req.url, 'http://localhost');
  const name = url.searchParams.get('name') || 'file';
  const mime = url.searchParams.get('type') || 'application/octet-stream';
  const wantCompress = url.searchParams.get('compress') === '1';

  let raw;
  try {
    raw = await readBody(req, MAX_BYTES);
  } catch (e) {
    if (e.tooLarge) return json(res, 413, { error: `Файл больше ${Math.round(MAX_BYTES / 1048576)} МБ.` });
    return json(res, 400, { error: 'Не удалось прочитать файл.' });
  }
  if (!raw.length) return json(res, 400, { error: 'Пустой файл.' });

  let bytes = raw;
  let ext = extFor(mime, name);
  let contentType = mime;

  // Сжимаем только если попросили И это растровая картинка. compressImage сам
  // вернёт null для svg/анимации/не-картинки — тогда оставляем оригинал.
  if (wantCompress && mime.startsWith('image/')) {
    const out = await compressImage(raw, ext);
    if (out) { bytes = out.bytes; ext = out.ext; contentType = 'image/webp'; }
  }

  let out;
  try {
    out = await putContentAddressed(bytes, ext, contentType);
  } catch (e) {
    const msg = /Cannot find package '@aws-sdk\/client-s3'/.test(e.message || '')
      ? 'Не установлен @aws-sdk/client-s3 (npm install).'
      : `Ошибка заливки в бакет: ${e.message}`;
    return json(res, 502, { error: msg });
  }

  return json(res, 200, { url: out.url, key: out.key, bytes: bytes.length });
}

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/** GET /content — страница «Обновление контента». */
export function renderContentPage() {
  const c = uiCfg();
  const configured = isUploadConfigured();
  const needPass = Boolean(c.password);
  const notReady = configured ? '' :
    `<div class="warn">Загрузка пока не настроена: задайте переменные окружения
     <code>UPLOADS_BUCKET</code> и ключи S3. Редактирование таблицы и инструкция работают.</div>`;

  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Обновление контента — OK DS</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;
       background:#f5f5f7;color:#111;padding:24px 16px 48px;box-sizing:border-box}
  .wrap{max-width:560px;margin:0 auto}
  h1{font-size:20px;margin:0 0 4px}
  .sub{font-size:13px;color:#666;margin:0 0 20px}
  .card{background:#fff;border-radius:16px;padding:22px 20px;margin-bottom:14px;
        box-shadow:0 8px 30px rgba(0,0,0,.06)}
  .card h2{font-size:15px;margin:0 0 10px}
  a.btn,button{display:inline-flex;align-items:center;justify-content:center;gap:6px;
    text-decoration:none;border:0;border-radius:12px;padding:13px 16px;font-size:15px;
    font-weight:600;cursor:pointer;transition:.15s;width:100%;box-sizing:border-box}
  a.btn{background:#111;color:#fff}
  a.btn:hover{background:#000}
  button.primary{background:#111;color:#fff}
  button.primary:hover{background:#000}
  button:disabled{background:#bdbdbd;cursor:default}
  .drop{border:2px dashed #d0d0d0;border-radius:12px;padding:26px 16px;text-align:center;
        color:#777;font-size:14px;cursor:pointer;transition:.15s;background:#fafafa}
  .drop.over{border-color:#111;background:#f0f0f0;color:#111}
  input[type=file]{display:none}
  .pass{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #e0e0e0;
        border-radius:10px;font-size:14px;margin-bottom:12px}
  .item{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid #f0f0f0;
        font-size:13px}
  .item:first-child{border-top:0}
  .item .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .item .st{color:#999;font-size:12px;white-space:nowrap}
  .item .st.ok{color:#1a8f3c}
  .item .st.err{color:#d33}
  .item label{display:flex;align-items:center;gap:4px;color:#777;font-size:12px;white-space:nowrap}
  .res{margin-top:8px;font-size:12px}
  .res input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #e0e0e0;
    border-radius:8px;font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#fafafa}
  .copy{margin-top:6px;width:auto;padding:7px 12px;font-size:12px;background:#eee;color:#111}
  .copy:hover{background:#e2e2e2}
  ol{margin:0;padding-left:20px;font-size:14px;line-height:1.6;color:#333}
  ol code{background:#f0f0f0;padding:1px 5px;border-radius:5px;font-size:12px}
  .warn{background:#fff7e6;border:1px solid #ffe2a8;color:#8a5a00;border-radius:10px;
        padding:10px 12px;font-size:13px;margin-bottom:14px}
  .back{display:inline-block;margin-bottom:16px;font-size:13px;color:#666;text-decoration:none}
  .back:hover{color:#111}
</style></head>
<body><div class="wrap">
  <a class="back" href="/">← К прототипам</a>
  <h1>Обновление контента</h1>
  <p class="sub">Дизайнеры наполняют прототип сами: таблица + загрузка своих картинок и клипов.</p>
  ${notReady}

  <div class="card">
    <h2>1. Редактировать контент</h2>
    <a class="btn" href="${esc(c.sheetUrl)}" target="_blank" rel="noopener">Открыть таблицу ↗</a>
  </div>

  <div class="card">
    <h2>2. Загрузить своё медиа</h2>
    ${needPass ? `<input class="pass" id="pass" type="password" placeholder="Пароль загрузки" autocomplete="off">` : ''}
    <div class="drop" id="drop">Перетащи файлы сюда или нажми, чтобы выбрать<br>картинки и клипы</div>
    <input type="file" id="file" multiple accept="image/*,video/*">
    <div id="list"></div>
  </div>

  <div class="card">
    <h2>3. Как это работает</h2>
    <ol>
      <li>Открой таблицу и правь нужный лист (люди, ленты, клипы и т.д.).</li>
      <li>Если у картинки/клипа есть внешняя ссылка — просто вставь её в таблицу.</li>
      <li>Если файл свой — залей его здесь, нажми «Скопировать» и вставь ссылку в нужную ячейку таблицы.</li>
      <li>Готово. Изменения подтянутся при обновлении ленты на главной (кнопка «Обновить ленту из таблицы»).</li>
    </ol>
  </div>
</div>
<script>
  const drop = document.getElementById('drop');
  const fileInput = document.getElementById('file');
  const list = document.getElementById('list');
  const passEl = document.getElementById('pass');
  const isVideo = (f) => (f.type || '').startsWith('video/');

  drop.addEventListener('click', () => fileInput.click());
  ['dragover','dragenter'].forEach(ev => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.add('over');
  }));
  ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.remove('over');
  }));
  drop.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
  fileInput.addEventListener('change', () => handleFiles(fileInput.files));

  function handleFiles(files) {
    [...files].forEach(addItem);
  }

  function addItem(file) {
    const row = document.createElement('div');
    row.className = 'item';
    const video = isVideo(file);
    row.innerHTML =
      '<span class="nm">' + escapeHtml(file.name) + '</span>' +
      (video
        ? '<span class="st">клип — без сжатия</span>'
        : '<label><input type="checkbox" class="cmp" checked> сжать</label>') +
      '<span class="st">…</span>';
    list.appendChild(row);
    const st = row.querySelectorAll('.st');
    const status = st[st.length - 1];
    const cmp = row.querySelector('.cmp');
    upload(file, video, cmp, status, row);
  }

  async function upload(file, video, cmpEl, status, row) {
    const compress = !video && cmpEl && cmpEl.checked ? '1' : '0';
    status.textContent = 'загружаю…'; status.className = 'st';
    try {
      const qs = new URLSearchParams({ name: file.name, type: file.type || '', compress });
      const headers = {};
      if (passEl) headers['x-upload-password'] = passEl.value || '';
      const r = await fetch('/api/upload?' + qs.toString(), { method: 'POST', headers, body: file });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
      status.textContent = Math.round((data.bytes || 0) / 1024) + ' КБ'; status.className = 'st ok';
      showResult(row, data.url);
    } catch (e) {
      status.textContent = 'ошибка'; status.className = 'st err';
      const note = document.createElement('div');
      note.className = 'res'; note.style.color = '#d33';
      note.textContent = e.message; row.appendChild(note);
    }
  }

  function showResult(row, url) {
    const box = document.createElement('div');
    box.className = 'res';
    const input = document.createElement('input');
    input.readOnly = true; input.value = url;
    const btn = document.createElement('button');
    btn.className = 'copy'; btn.textContent = 'Скопировать ссылку';
    btn.onclick = async () => {
      try { await navigator.clipboard.writeText(url); }
      catch { input.select(); document.execCommand('copy'); }
      btn.textContent = 'Скопировано ✓';
      setTimeout(() => (btn.textContent = 'Скопировать ссылку'), 1500);
    };
    box.appendChild(input); box.appendChild(btn);
    row.parentNode.insertBefore(box, row.nextSibling);
  }

  function escapeHtml(s){return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
</script>
</body></html>`;
}
