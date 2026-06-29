#!/usr/bin/env node
/**
 * server.mjs — раздаёт статический прототип OK DS.
 *
 * Сайт — чистая статика. Контент («запечённые» data/*.json|js и HTML-страницы)
 * обновляет автор локально скриптами scripts/fetch-*.mjs (скилл fetch-all) и
 * коммитит в репозиторий — сервер лишь раздаёт уже готовые файлы. Никакого
 * синка из Google-таблицы и никакого облака на сервере нет.
 *
 * Запуск (контейнер делает это через `npm start`):
 *   node server.mjs
 *
 * Переменные окружения:
 *   PORT — порт (контейнер задаёт сам; локально по умолчанию 3000)
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

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

/* Лендинг по «/»: только выбор прототипа. Контент обновляется офлайн (fetch-all
 * + коммит), поэтому кнопок синка/загрузки и страницы дизайнера тут нет. */
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
</style></head>
<body><div class="card">
  <h1>Прототипы OK DS</h1>
  <p class="sub">Выберите прототип.</p>
  <a class="proto" href="/q3">Q-3</a>
  <a class="proto" href="/activity">Активити</a>
</div></body></html>`;

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

    // Прототип доступен только по ссылке — просим поисковики не индексировать.
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    // robots.txt — полный запрет обхода краулерами.
    if (pathname === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('User-agent: *\nDisallow: /\n');
      return;
    }

    // Здоровье (для контейнера и деплой-диагностики).
    if (pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, build: 'static-1' }));
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
  console.log('Статика: контент обновляется офлайн (scripts/fetch-all.mjs) и коммитится.');
});
