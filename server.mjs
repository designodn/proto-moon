#!/usr/bin/env node
/**
 * server.mjs — раздаёт статический прототип и сам обновляет ленту из гуглшита.
 *
 * Зачем: сайт — чистая статика, но данные «запекаются» в файлы скриптами
 * scripts/fetch-*.mjs. Чтобы лента была свежей, этот сервер гоняет
 * scripts/fetch-all.mjs (перезаписывает data/*.json и HTML-страницы прямо в
 * контейнере) при старте и по кнопке на лендинге, и отдаёт свежие файлы.
 *
 * Запуск (Railway делает это сам через `npm start`):
 *   node server.mjs
 *
 * Переменные окружения:
 *   PORT           — порт (Railway задаёт сам; локально по умолчанию 3000)
 *   SYNC_ON_START  — гонять синк при старте ("false" чтобы выключить)
 *
 * Требование: Google-таблица открыта «всем, у кого есть ссылка», иначе
 * gviz-CSV не отдаст данные и синк будет падать (сайт при этом раздаётся).
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, normalize, extname } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const SYNC_ON_START = String(process.env.SYNC_ON_START ?? 'true') !== 'false';

/* ── Прототипы: красивый путь → реальная стартовая страница ───────────────── */
/* Редиректим (а не отдаём контент по чужому URL), чтобы относительные ссылки
 * на ассеты/стили внутри страницы продолжали работать от её настоящего пути. */
const PROTOTYPES = {
  '/nv':       '/new-vision/lenta.html',      // New Vision — основная лента
  '/activity': '/activity-lenta/view.html',   // Activity-лента — локскрин-старт (как q3-view)
  '/q3':       '/q3-view.html',               // Q3 — локскрин-старт
  '/preview':  '/preview.html',              // витрина дизайн-системы
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
};

/* Лендинг по «/»: выбор прототипа + ручное обновление ленты из таблицы. */
const LANDING = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OK DS — прототипы</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;
       background:#f5f5f7;color:#111;display:flex;min-height:100vh;
       align-items:center;justify-content:center;padding:20px;box-sizing:border-box}
  .card{background:#fff;border-radius:16px;padding:32px 28px;max-width:380px;width:100%;
        box-shadow:0 8px 30px rgba(0,0,0,.08)}
  h1{font-size:18px;margin:0 0 4px}
  .sub{font-size:13px;color:#666;margin:0 0 20px}
  a.proto{display:flex;justify-content:space-between;align-items:center;text-decoration:none;
    color:#111;padding:14px 16px;border:1px solid #ececec;border-radius:12px;margin-bottom:10px;
    font-size:15px;font-weight:600;transition:.15s}
  a.proto:hover{border-color:#d0d0d0;background:#fafafa}
  a.proto span{font-size:12px;color:#999;font-weight:400}
  .sync{margin-top:20px;padding-top:20px;border-top:1px solid #ececec}
  button{width:100%;padding:14px 16px;border:0;border-radius:12px;background:#111;color:#fff;
    font-size:15px;font-weight:600;cursor:pointer;transition:.15s}
  button:hover{background:#000}
  button:disabled{background:#bdbdbd;cursor:default}
  .status{font-size:12px;color:#777;margin:10px 2px 0;min-height:16px;text-align:center}
  .status.ok{color:#1a8f3c}
  .status.err{color:#d33}
</style></head>
<body><div class="card">
  <h1>Прототипы OK DS</h1>
  <p class="sub">Выберите прототип или обновите ленту из Google-таблицы.</p>
  <a class="proto" href="/q3">Q-3</a>
  <a class="proto" href="/activity">Активити</a>
  <div class="sync">
    <button id="syncBtn">Обновить ленту из таблицы</button>
    <div class="status" id="status"></div>
  </div>
<script>
  const btn = document.getElementById('syncBtn');
  const status = document.getElementById('status');
  const setStatus = (t, cls='') => { status.textContent = t; status.className = 'status ' + cls; };

  function fmtTime(iso){ try { return new Date(iso).toLocaleTimeString('ru-RU'); } catch { return ''; } }

  async function refreshLast(){
    try {
      const h = await (await fetch('/healthz')).json();
      if (h.syncing){ startPolling(); return; }
      if (h.lastSync){
        const ls = h.lastSync;
        if (ls.ok) setStatus('Обновлено в ' + fmtTime(ls.finishedAt), 'ok');
        else setStatus('Прошлый прогон с ошибкой (код ' + (ls.code ?? '—') + ')', 'err');
      }
    } catch {}
  }

  let polling = false;
  function startPolling(){
    if (polling) return;
    polling = true;
    btn.disabled = true;
    setStatus('Обновляю ленту из таблицы…');
    const tick = async () => {
      try {
        const h = await (await fetch('/healthz')).json();
        if (h.syncing){ setTimeout(tick, 2000); return; }
        polling = false; btn.disabled = false;
        const ls = h.lastSync;
        const g = ls && ls.git;
        if (ls && ls.ok) {
          let suffix = '';
          if (g && g.pushed) suffix = ' и запушено';
          else if (g && g.nochange) suffix = ' (без изменений)';
          else if (g && g.skipped) suffix = ' (без коммита)';
          setStatus('Готово — обновлено' + suffix + ' в ' + fmtTime(ls.finishedAt), 'ok');
        } else if (g && g.committed && !g.ok) {
          setStatus('Обновлено, но пуш не прошёл — проверь GITHUB_TOKEN', 'err');
        } else {
          setStatus('Синк завершился с ошибкой (код ' + (ls && ls.code != null ? ls.code : '—') + ')', 'err');
        }
      } catch {
        polling = false; btn.disabled = false;
        setStatus('Не удалось получить статус', 'err');
      }
    };
    setTimeout(tick, 2000);
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    setStatus('Запускаю…');
    try {
      const r = await fetch('/api/sync', { method: 'POST' });
      startPolling();
    } catch {
      btn.disabled = false;
      setStatus('Не удалось запустить обновление', 'err');
    }
  });

  refreshLast();
</script>
</div></body></html>`;

/* ── Синк ленты из гуглшита ───────────────────────────────────────────────── */
let syncing = false;
let lastSync = null; // { reason, startedAt, finishedAt, ok, code, git }

/* Запуск git-команды (промис, не блокирует сервер). */
function git(args) {
  return new Promise((res) => {
    const p = spawn('git', args, { cwd: ROOT });
    let out = '', err = '';
    p.stdout?.on('data', (d) => { out += d; });
    p.stderr?.on('data', (d) => { err += d; });
    p.on('close', (code) => res({ code, out, err }));
    p.on('error', (e) => res({ code: -1, err: e.message }));
  });
}

/* После успешного синка: коммитим изменённые данные/страницы и пушим, чтобы они
 * пережили рестарт эфемерного контейнера. Включено по умолчанию; выключить —
 * SYNC_GIT_COMMIT=false. Для пуша нужен токен (GITHUB_TOKEN) — без него коммит
 * сделаем, но пуш не пройдёт (залогируем). Ветка/идентичность/репо — через env. */
async function commitAndPush(reason) {
  if (process.env.SYNC_GIT_COMMIT === 'false') return { ok: true, skipped: true };

  const status = await git(['status', '--porcelain']);
  if (status.code !== 0) return { ok: false, error: `git status: ${status.err.trim()}` };
  if (!status.out.trim()) { console.log('[git] нечего коммитить'); return { ok: true, nochange: true }; }

  await git(['add', '-A']);
  const name = process.env.SYNC_GIT_NAME || 'proto-moon sync';
  const email = process.env.SYNC_GIT_EMAIL || 'sync@proto-moon.local';
  const msg = `sync: обновление из таблицы (${reason})`;
  const commit = await git(['-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-m', msg]);
  if (commit.code !== 0) return { ok: false, error: `git commit: ${commit.err.trim()}` };

  const branch = process.env.SYNC_GIT_BRANCH
    || (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).out.trim() || 'main';
  const token = process.env.GITHUB_TOKEN || process.env.GIT_PUSH_TOKEN || '';
  const slug = process.env.GIT_REPO_SLUG || 'designodn/proto-moon';
  const target = token ? `https://x-access-token:${token}@github.com/${slug}.git` : 'origin';
  const push = await git(['push', target, `HEAD:${branch}`]);
  if (push.code !== 0) {
    const safe = (push.err || '').split(token || '\0').join('***').trim();  // не светим токен
    return { ok: false, committed: true, error: `git push: ${safe}` };
  }
  console.log(`[git] закоммичено и запушено в ${branch}`);
  return { ok: true, pushed: true, branch };
}

function runSync(reason) {
  if (syncing) {
    console.log(`[sync] пропуск (${reason}): предыдущий прогон ещё идёт`);
    return false;
  }
  syncing = true;
  const startedAt = new Date().toISOString();
  console.log(`[sync] старт (${reason}) ${startedAt}`);
  const child = spawn(process.execPath, [resolve(ROOT, 'scripts/fetch-all.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  child.on('close', async (code) => {
    let gitRes = null;
    if (code === 0) {
      gitRes = await commitAndPush(reason).catch((e) => ({ ok: false, error: e.message }));
      if (gitRes && !gitRes.ok) console.error(`[git] ошибка: ${gitRes.error}`);
    }
    syncing = false;
    lastSync = { reason, startedAt, finishedAt: new Date().toISOString(),
      ok: code === 0 && (!gitRes || gitRes.ok), code, git: gitRes };
    console.log(`[sync] финиш (${reason}), код ${code ?? '—'}`);
  });
  child.on('error', (err) => {
    syncing = false;
    lastSync = { reason, startedAt, finishedAt: new Date().toISOString(), ok: false, error: err.message };
    console.error(`[sync] не удалось запустить fetch-all: ${err.message}`);
  });
  return true;
}

/* Плавающая кнопка «в меню» — подмешивается во все HTML прототипов, чтобы из
 * любого экрана (локскрин, меню, приложение) можно было вернуться на разводящую. */
const HOME_BUTTON = `
<a href="/" id="__launcher-home" aria-label="В меню прототипов"
   style="position:fixed;left:12px;bottom:12px;z-index:2147483647;display:flex;
   align-items:center;gap:6px;padding:8px 12px;background:rgba(0,0,0,.62);
   color:#fff;font:600 12px/1 system-ui,-apple-system,sans-serif;text-decoration:none;
   border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.35);backdrop-filter:blur(4px);
   opacity:.55;transition:opacity .15s" onmouseover="this.style.opacity=1"
   onmouseout="this.style.opacity=.55">☰ Меню</a>`;

/* ── Статика ──────────────────────────────────────────────────────────────── */
async function sendFile(res, filePath) {
  const data = await readFile(filePath);
  const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
  // В HTML-страницы прототипов подмешиваем кнопку возврата на разводящую.
  if (type.startsWith('text/html')) {
    let html = data.toString('utf8');
    html = html.includes('</body>')
      ? html.replace('</body>', `${HOME_BUTTON}\n</body>`)
      : html + HOME_BUTTON;
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(html);
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(data);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);

    // Здоровье + статус последнего синка (для Railway и кнопки на лендинге).
    if (pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, syncing, lastSync }));
      return;
    }

    // Ручной запуск синка с лендинга.
    if (pathname === '/api/sync') {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST' });
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return;
      }
      const started = runSync('manual');
      res.writeHead(started ? 202 : 409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ started, syncing }));
      return;
    }

    // Корень — лендинг со списком прототипов.
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(LANDING);
      return;
    }

    // Красивые пути прототипов → редирект на реальную страницу.
    const proto = PROTOTYPES[pathname.replace(/\/$/, '')];
    if (proto) {
      res.writeHead(302, { Location: proto });
      res.end();
      return;
    }

    // Защита от выхода за пределы каталога проекта.
    const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    let filePath = join(ROOT, safe);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // Каталог → его index.html.
    try {
      const s = await stat(filePath);
      if (s.isDirectory()) filePath = join(filePath, 'index.html');
    } catch { /* нет файла — обработаем ниже как 404 */ }

    await sendFile(res, filePath);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 — не найдено');
    } else {
      console.error('[server] ошибка:', err);
      res.writeHead(500);
      res.end('500 — внутренняя ошибка');
    }
  }
});

server.listen(PORT, () => {
  console.log(`Сервер слушает :${PORT}`);
  console.log(`Прототипы: /nv, /activity, /q3, /preview`);
  console.log('Синк ленты: при старте и по кнопке на лендинге');
  if (SYNC_ON_START) runSync('startup');
});
