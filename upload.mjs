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

import { isUploadConfigured, putContentAddressed, listAllObjects, deleteKeys, publicUrlFor, bucketConfig } from './scripts/lib/bucket.mjs';
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
  if (!isUploadConfigured()) {
    return json(res, 503, { error: 'Хранилище не настроено: задайте env UPLOADS_BUCKET и ключи S3.' });
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

/** Ключ — это загрузка ДИЗАЙНЕРА (а не синк-медиа assets/ и не снапшот state/)? */
function isDesignerKey(key) {
  if (!key || key.startsWith('assets/') || key.startsWith('state/')) return false;
  const prefix = bucketConfig().prefix;            // UPLOADS_PREFIX, если задан
  return prefix ? key.startsWith(prefix) : true;
}

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

/** GET /api/uploads — список загрузок дизайнеров (без синк-медиа и снапшота),
 *  свежие сверху. → { items: [{ key, url, kind, bytes, ts }] }. */
export async function handleListUploads(req, res) {
  if (!isUploadConfigured()) return json(res, 200, { items: [] });
  let all;
  try { all = await listAllObjects(); } catch (e) { return json(res, 502, { error: e.message }); }
  const items = all
    .filter((o) => isDesignerKey(o.key))
    .map((o) => ({
      key: o.key,
      url: publicUrlFor(o.key),
      kind: VIDEO_EXT.test(o.key) ? 'video' : 'image',
      bytes: o.size,
      ts: o.lastModified ? new Date(o.lastModified).getTime() : 0,
    }))
    .sort((a, b) => b.ts - a.ts);
  return json(res, 200, { items });
}

/** POST /api/upload/delete?key=… — удалить ОДНУ загрузку дизайнера (крестик).
 *  Защита: ключи синка (assets/) и снапшота (state/) удалять нельзя. */
export async function handleDeleteUpload(req, res) {
  if (!isUploadConfigured()) return json(res, 503, { error: 'Хранилище не настроено.' });
  const u = new URL(req.url, 'http://localhost');
  const key = u.searchParams.get('key') || '';
  if (!key) return json(res, 400, { error: 'Не указан ключ.' });
  if (!isDesignerKey(key)) return json(res, 403, { error: 'Этот объект удалять нельзя.' });
  try { await deleteKeys([key]); } catch (e) { return json(res, 502, { error: e.message }); }
  return json(res, 200, { ok: true, key });
}

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/** GET /content — страница «Обновление контента». */
export function renderContentPage() {
  const c = uiCfg();
  const configured = isUploadConfigured();
  const notReady = configured ? '' :
    `<div class="warn">Загрузка пока не настроена: задайте переменные окружения
     <code>UPLOADS_BUCKET</code> и ключи S3. Редактирование таблицы работает.</div>`;

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
  a.btn,button.primary{display:inline-flex;align-items:center;justify-content:center;gap:6px;
    text-decoration:none;border:0;border-radius:12px;padding:13px 16px;font-size:15px;
    font-weight:600;cursor:pointer;transition:.15s;width:100%;box-sizing:border-box;background:#111;color:#fff}
  a.btn:hover,button.primary:hover{background:#000}
  button.primary:disabled{background:#bdbdbd;cursor:default}
  button.primary{position:relative}
  button.primary.sparkle{animation:sparkleGlow 1.9s ease-in-out infinite}
  button.primary.sparkle::after{content:'✨';position:absolute;right:12px;top:50%;
    transform:translateY(-50%);font-size:15px;animation:twinkle 1.5s ease-in-out infinite;pointer-events:none}
  @keyframes sparkleGlow{0%,100%{box-shadow:0 0 0 0 rgba(124,108,255,0)}50%{box-shadow:0 0 16px 2px rgba(124,108,255,.5)}}
  @keyframes twinkle{0%,100%{opacity:.35;transform:translateY(-50%) scale(.85)}50%{opacity:1;transform:translateY(-50%) scale(1.2)}}
  .status{font-size:12px;color:#777;margin:10px 2px 0;min-height:16px;text-align:center}
  .status.ok{color:#1a8f3c}
  .status.err{color:#d33}
  .status.warn{color:#c47d00}
  .dead{margin-top:8px}
  .dead details{font-size:12px;color:#8a5a00;background:#fff7e6;border:1px solid #ffe2a8;
    border-radius:10px;padding:8px 12px}
  .dead summary{cursor:pointer;font-weight:600}
  .dead ul{margin:8px 0 0;padding-left:18px;line-height:1.6}
  .dead li{word-break:break-word}
  .dead .where{color:#b45;font-weight:600}
  .drop{border:2px dashed #d0d0d0;border-radius:12px;padding:26px 16px;text-align:center;
        color:#777;font-size:14px;cursor:pointer;transition:.15s;background:#fafafa}
  .drop.over{border-color:#111;background:#f0f0f0;color:#111}
  input[type=file]{display:none}
  .grid{margin-top:12px}
  .row{display:flex;align-items:center;gap:12px;padding:8px 0;border-top:1px solid #f0f0f0}
  .row:first-child{border-top:0}
  .ava{width:72px;height:72px;flex:none;border-radius:14px;overflow:hidden;background:#eceef0}
  .ava img,.ava video{width:100%;height:100%;object-fit:cover;display:block}
  .row.pending .ava{display:flex;align-items:center;justify-content:center;color:#999;font-size:11px}
  .acts{margin-left:auto;display:flex;gap:8px}
  .acts button{width:34px;height:34px;padding:0;border:0;border-radius:50%;cursor:pointer;font-size:17px;
    line-height:1;display:flex;align-items:center;justify-content:center;background:#eef0f2;color:#111}
  .acts .copy:hover{background:#e2e4e7}
  .acts .del{background:#fdecec;color:#d33}
  .acts .del:hover{background:#fbd9d9}
  .undo{margin-left:auto;display:flex;align-items:center;gap:10px;font-size:13px;color:#888}
  .undo b{color:#111;font-variant-numeric:tabular-nums}
  .undo .restore{width:auto;padding:7px 13px;border:0;border-radius:9px;background:#111;color:#fff;
    font-weight:600;font-size:13px;cursor:pointer}
  .undo .restore:hover{background:#000}
  .empty{color:#999;font-size:13px;text-align:center;padding:14px 0}
  ol{margin:0;padding-left:20px;font-size:14px;line-height:1.6;color:#333}
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
    <button class="primary" id="syncBtn">Обновить ленту из таблицы</button>
    <div class="status" id="syncStatus"></div>
    <div class="dead" id="syncDead"></div>
  </div>

  <div class="card">
    <h2>Редактировать контент</h2>
    <a class="btn" href="${esc(c.sheetUrl)}" target="_blank" rel="noopener">Открыть таблицу ↗</a>
  </div>

  <div class="card">
    <h2>Загрузить медиа</h2>
    <div class="drop" id="drop">Перетащи файлы сюда или нажми, чтобы выбрать<br>картинки и клипы</div>
    <input type="file" id="file" multiple accept="image/*,video/*">
    <div class="grid" id="grid"></div>
    <div class="empty" id="empty">Пока ничего не загружено.</div>
  </div>

  <div class="card">
    <h2>Как это работает</h2>
    <ol>
      <li>Картинка уже есть в интернете? Нажми на неё правой кнопкой → «Копировать адрес картинки» (Copy Image Address) и вставь ссылку прямо в ячейку таблицы.</li>
      <li>Своё изображение или клип — перетащи в зону загрузки выше. В появившейся строке нажми <b>⧉</b> — ссылка скопируется, вставь её в нужную ячейку таблицы.</li>
      <li>Передумал — нажми <b>×</b> (есть 6 секунд, чтобы «Вернуть»).</li>
      <li>Готово — жми «Обновить ленту из таблицы» вверху, изменения подтянутся.</li>
    </ol>
  </div>
</div>
<script>
  var $ = function(id){ return document.getElementById(id); };

  /* ---- синк ---- */
  var syncBtn = $('syncBtn'), syncStatus = $('syncStatus'), syncDead = $('syncDead');
  function setSync(t, cls){ syncStatus.textContent = t; syncStatus.className = 'status ' + (cls||''); }
  function fmtTime(iso){ try { return new Date(iso).toLocaleTimeString('ru-RU'); } catch(e){ return ''; } }
  /* Список битых медиа-ссылок (где искать в таблице). Собираем DOM-узлами, без
     innerHTML с URL — чтобы не словить инъекцию из значения ячейки. */
  function renderDead(list){
    syncDead.textContent = '';
    if (!list || !list.length) return;
    var det = document.createElement('details');
    var sum = document.createElement('summary');
    sum.textContent = 'Где искать в таблице (' + list.length + ')';
    det.appendChild(sum);
    var ul = document.createElement('ul');
    list.forEach(function(d){
      var li = document.createElement('li');
      var w = document.createElement('span'); w.className = 'where';
      w.textContent = 'Лист «' + (d.sheet || '—') + '» > ' + (d.where || '—');
      li.appendChild(w);
      li.appendChild(document.createTextNode(' — ' + (d.url || '')));
      ul.appendChild(li);
    });
    det.appendChild(ul);
    syncDead.appendChild(det);
  }
  function plural(n){
    var d = n % 10, dd = n % 100;
    if (d === 1 && dd !== 11) return 'ссылка';
    if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 'ссылки';
    return 'ссылок';
  }
  var polling = false;
  function pollSync(){
    if (polling) return; polling = true; syncBtn.disabled = true; setSync('Обновляю ленту из таблицы…');
    var tick = async function(){
      try {
        var h = await (await fetch('/healthz')).json();
        if (h.syncing){ setTimeout(tick, 2000); return; }
        polling = false; syncBtn.disabled = false;
        var ls = h.lastSync, snap = ls && ls.snapshot;
        if (ls && ls.ok){
          if (ls.deadCount > 0){
            setSync('Готово, но ' + ls.deadCount + ' ' + plural(ls.deadCount) + ' не открылись', 'warn');
            renderDead(ls.dead);
          } else {
            var s = (snap && snap.ok) ? ' и сохранено в облако' : '';
            setSync('Готово — обновлено' + s + ' в ' + fmtTime(ls.finishedAt), 'ok');
            renderDead(null);
          }
        } else {
          setSync('Синк с ошибкой (код ' + (ls && ls.code != null ? ls.code : '—') + ')', 'err');
          renderDead(null);
        }
      } catch(e){ polling = false; syncBtn.disabled = false; setSync('Не удалось получить статус', 'err'); }
    };
    setTimeout(tick, 2000);
  }
  syncBtn.addEventListener('click', async function(){
    syncBtn.disabled = true; setSync('Запускаю…');
    try { await fetch('/api/sync', { method: 'POST' }); pollSync(); }
    catch(e){ syncBtn.disabled = false; setSync('Не удалось запустить', 'err'); }
  });
  (async function(){
    try {
      var h = await (await fetch('/healthz')).json();
      if (h.syncing) pollSync();
      else if (h.lastSync && h.lastSync.ok){
        var ls = h.lastSync;
        if (ls.deadCount > 0){
          setSync('Готово, но ' + ls.deadCount + ' ' + plural(ls.deadCount) + ' не открылись', 'warn');
          renderDead(ls.dead);
        } else {
          setSync('Обновлено в ' + fmtTime(ls.finishedAt), 'ok');
        }
      }
    } catch(e){}
  })();

  /* ---- галерея загрузок ---- */
  var grid = $('grid'), empty = $('empty');
  function updateState(){
    var has = !!grid.querySelector('.row');
    empty.style.display = has ? 'none' : 'block';
    syncBtn.classList.toggle('sparkle', has);        // есть загрузки → кнопка искрит
  }
  function media(item){
    return item.kind === 'video'
      ? '<video src="' + item.url + '" muted playsinline></video>'
      : '<img src="' + item.url + '" loading="lazy" alt="">';
  }
  function actsEl(item, el){
    var acts = document.createElement('div'); acts.className = 'acts';
    acts.innerHTML =
      '<button class="copy" title="Скопировать ссылку">⧉</button>' +
      '<button class="del" title="Удалить">×</button>';
    acts.querySelector('.copy').onclick = function(){ copyUrl(item.url, el); };
    acts.querySelector('.del').onclick = function(){ askDelete(item, el); };
    return acts;
  }
  function rowEl(item){
    var el = document.createElement('div'); el.className = 'row'; el.dataset.key = item.key;
    el.innerHTML = '<div class="ava">' + media(item) + '</div>';
    el.appendChild(actsEl(item, el));
    return el;
  }
  async function copyUrl(url, el){
    try { await navigator.clipboard.writeText(url); } catch(e){}
    var b = el.querySelector('.copy'); if (!b) return;
    var o = b.textContent; b.textContent = '✓';
    setTimeout(function(){ b.textContent = o; }, 1200);
  }
  /* Удаление с отменой: 6 сек обратный отсчёт + «Вернуть». Реально удаляем ТОЛЬКО
     когда таймер дошёл до нуля (нажал «Вернуть» — ничего и не удалилось). */
  function askDelete(item, el){
    var left = 6;
    var ava = el.querySelector('.ava'); ava.style.opacity = '.4';
    var und = document.createElement('div'); und.className = 'undo';
    und.innerHTML = 'Удаляю через <b>' + left + '</b> с <button class="restore">Вернуть</button>';
    el.replaceChild(und, el.querySelector('.acts'));
    var iv = setInterval(function(){
      left--; var b = und.querySelector('b'); if (b) b.textContent = left;
      if (left <= 0) { clearInterval(iv); commitDelete(item, el); }
    }, 1000);
    und.querySelector('.restore').onclick = function(){
      clearInterval(iv); ava.style.opacity = '1';
      el.replaceChild(actsEl(item, el), und);
    };
  }
  async function commitDelete(item, el){
    try {
      var r = await fetch('/api/upload/delete?key=' + encodeURIComponent(item.key), { method: 'POST' });
      if (!r.ok) throw 0;
      el.remove(); updateState();
    } catch(e){
      el.querySelector('.ava').style.opacity = '1';
      el.replaceChild(actsEl(item, el), el.querySelector('.undo'));
      alert('Не удалось удалить');
    }
  }
  async function loadGallery(){
    try {
      var data = await (await fetch('/api/uploads')).json();
      grid.innerHTML = '';
      (data.items || []).forEach(function(it){ grid.appendChild(rowEl(it)); });
    } catch(e){}
    updateState();
  }
  loadGallery();

  /* ---- загрузка ---- */
  var drop = $('drop'), fileInput = $('file');
  drop.addEventListener('click', function(){ fileInput.click(); });
  ['dragover','dragenter'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave','drop'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function(e){ handleFiles(e.dataTransfer.files); });
  fileInput.addEventListener('change', function(){ handleFiles(fileInput.files); });
  function handleFiles(files){ [].slice.call(files).forEach(uploadFile); }
  async function uploadFile(file){
    var video = (file.type || '').startsWith('video/');
    var ph = document.createElement('div'); ph.className = 'row pending';
    ph.innerHTML = '<div class="ava">…</div>';
    grid.insertBefore(ph, grid.firstChild); updateState();
    try {
      var qs = new URLSearchParams({ name: file.name, type: file.type || '', compress: video ? '0' : '1' });
      var r = await fetch('/api/upload?' + qs.toString(), { method: 'POST', body: file });
      var data = await r.json();
      if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
      grid.replaceChild(rowEl({ key: data.key, url: data.url, kind: video ? 'video' : 'image' }), ph);
      updateState();
    } catch(e){
      ph.querySelector('.ava').textContent = '✗'; ph.title = e.message;
      setTimeout(function(){ ph.remove(); updateState(); }, 2500);
    }
  }
</script>
</body></html>`;
}
