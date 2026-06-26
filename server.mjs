#!/usr/bin/env node
/**
 * server.mjs — раздаёт статический прототип и сам обновляет ленту из гуглшита.
 *
 * Зачем: сайт — чистая статика, но данные «запекаются» в файлы скриптами
 * scripts/fetch-*.mjs. Чтобы лента обновлялась сама, этот сервер по таймеру
 * гоняет scripts/fetch-all.mjs (перезаписывает data/*.json и HTML-страницы
 * прямо в контейнере) и отдаёт уже свежие файлы.
 *
 * Запуск (Railway делает это сам через `npm start`):
 *   node server.mjs
 *
 * Переменные окружения:
 *   PORT                   — порт (Railway задаёт сам; локально по умолчанию 3000)
 *   SYNC_INTERVAL_MINUTES  — как часто пересобирать ленту (по умолчанию 15; 0 — выкл.)
 *   SYNC_ON_START          — гонять синк при старте ("false" чтобы выключить)
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
const SYNC_INTERVAL_MIN = Number(process.env.SYNC_INTERVAL_MINUTES ?? 15);
const SYNC_ON_START = String(process.env.SYNC_ON_START ?? 'true') !== 'false';

/* ── Прототипы: красивый путь → реальная стартовая страница ───────────────── */
/* Редиректим (а не отдаём контент по чужому URL), чтобы относительные ссылки
 * на ассеты/стили внутри страницы продолжали работать от её настоящего пути. */
const PROTOTYPES = {
  '/nv':       '/new-vision/lenta.html',     // New Vision — основная лента
  '/activity': '/new-vision/okruzhenie.html', // «Вокруг вас»
  '/q3':       '/lenta-q3.html',             // Q3
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

/* Лендинг по «/»: простой список прототипов, чтобы было что расшарить. */
const LANDING = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OK DS — прототипы</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;
       background:#f5f5f7;color:#111;display:flex;min-height:100vh;
       align-items:center;justify-content:center}
  .card{background:#fff;border-radius:16px;padding:32px 28px;max-width:360px;width:100%;
        box-shadow:0 8px 30px rgba(0,0,0,.08)}
  h1{font-size:18px;margin:0 0 4px}
  p{font-size:13px;color:#666;margin:0 0 20px}
  a{display:flex;justify-content:space-between;align-items:center;text-decoration:none;
    color:#111;padding:14px 16px;border:1px solid #ececec;border-radius:12px;margin-bottom:10px;
    font-size:15px;font-weight:600;transition:.15s}
  a:hover{border-color:#d0d0d0;background:#fafafa}
  a span{font-size:12px;color:#999;font-weight:400}
</style></head>
<body><div class="card">
  <h1>Прототипы OK DS</h1>
  <p>Лента обновляется из Google-таблицы автоматически.</p>
  <a href="/nv">New Vision <span>/nv</span></a>
  <a href="/activity">Вокруг вас <span>/activity</span></a>
  <a href="/q3">Q3 <span>/q3</span></a>
  <a href="/preview">Дизайн-система <span>/preview</span></a>
</div></body></html>`;

/* ── Синк ленты из гуглшита ───────────────────────────────────────────────── */
let syncing = false;
function runSync(reason) {
  if (syncing) {
    console.log(`[sync] пропуск (${reason}): предыдущий прогон ещё идёт`);
    return;
  }
  syncing = true;
  const startedAt = new Date().toISOString();
  console.log(`[sync] старт (${reason}) ${startedAt}`);
  const child = spawn(process.execPath, [resolve(ROOT, 'scripts/fetch-all.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  child.on('close', (code) => {
    syncing = false;
    console.log(`[sync] финиш (${reason}), код ${code ?? '—'}`);
  });
  child.on('error', (err) => {
    syncing = false;
    console.error(`[sync] не удалось запустить fetch-all: ${err.message}`);
  });
}

/* ── Статика ──────────────────────────────────────────────────────────────── */
async function sendFile(res, filePath) {
  const data = await readFile(filePath);
  const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(data);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);

    // Здоровье для Railway/мониторинга.
    if (pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, syncing }));
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
  if (SYNC_ON_START) runSync('startup');
  if (SYNC_INTERVAL_MIN > 0) {
    setInterval(() => runSync('interval'), SYNC_INTERVAL_MIN * 60_000);
    console.log(`Автосинк ленты: каждые ${SYNC_INTERVAL_MIN} мин`);
  } else {
    console.log('Автосинк по таймеру выключен (SYNC_INTERVAL_MINUTES=0)');
  }
});
