/**
 * content-snapshot.mjs — снапшот синканутого контента в бакет и обратно.
 *
 * Вместо коммита результата синка в git (мерджи в main) кладём его в S3-бакет
 * одним JSON-файлом state/content.json:
 *   { version, createdAt, files: { "<относит.путь>": "<текст файла>" } }
 *
 * Зачем:
 *  - состояние ленты durable: переживает редеплой/рестарт без git и без таблицы;
 *  - main не трогаем — никаких авто-мерджей;
 *  - снапшот лежит по постоянному публичному URL → его можно отдать для сборки
 *    зеркала (скачать и закоммитить в main по требованию).
 *
 * Медиа в снапшот НЕ входят — они уже в бакете (ссылки абсолютные). Тут только
 * текст: data/*.json|js + перерисованные синком HTML-страницы.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { putAtKey, publicUrlFor, isUploadConfigured } from './bucket.mjs';

const SNAPSHOT_KEY = 'state/content.json';

// HTML-страницы, которые перезаписывает синк (fetch-all + wire-vvz). Папку data/
// берём целиком отдельно. Список синхронизирован с writeFileSync в scripts/fetch-*.mjs
// и scripts/wire-vvz.mjs — добавишь новый рендер-таргет, допиши сюда.
const HTML_FILES = [
  'lenta.html', 'lenta-q3.html', 'tribune.html', 'profile.html', 'marathon.html',
  'friends.html', 'guests.html', 'messages.html',
  'new-vision/lenta.html', 'new-vision/okruzhenie.html',
  'activity-lenta/lenta.html', 'activity-lenta/okruzhenie.html',
  'components/today-widgets.partial.html',
];

export function snapshotKey() { return SNAPSHOT_KEY; }
export function snapshotUrl() { return isUploadConfigured() ? publicUrlFor(SNAPSHOT_KEY) : null; }

/** Список относительных путей контента: всё data/*.{json,js} + HTML-страницы синка. */
function contentPaths(root) {
  const out = [];
  const dataDir = resolve(root, 'data');
  if (existsSync(dataDir)) {
    for (const f of readdirSync(dataDir)) if (/\.(json|js)$/.test(f)) out.push(`data/${f}`);
  }
  for (const h of HTML_FILES) if (existsSync(resolve(root, h))) out.push(h);
  return out;
}

/** Собирает снапшот контента и заливает в бакет (no-cache — объект меняющийся).
 *  → { ok:true, url, count } | { ok:false, skipped:'no-bucket' } | { ok:false, error } */
export async function uploadSnapshot(root) {
  if (!isUploadConfigured()) return { ok: false, skipped: 'no-bucket' };
  const files = {};
  for (const p of contentPaths(root)) {
    try { files[p] = readFileSync(resolve(root, p), 'utf8'); } catch { /* нечитаемое — пропуск */ }
  }
  const bundle = JSON.stringify({ version: 1, createdAt: new Date().toISOString(), files });
  await putAtKey(SNAPSHOT_KEY, Buffer.from(bundle, 'utf8'), 'application/json', 'no-cache');
  return { ok: true, url: publicUrlFor(SNAPSHOT_KEY), count: Object.keys(files).length };
}

/** Скачивает снапшот из бакета и раскладывает файлы по их путям.
 *  → { ok:true, count, createdAt } | { ok:false, skipped } | { ok:false, error } */
export async function restoreSnapshot(root) {
  if (!isUploadConfigured()) return { ok: false, skipped: 'no-bucket' };
  // кэш-бастер: объект no-cache, но дополнительно страхуемся от прокси-кэша.
  const url = publicUrlFor(SNAPSHOT_KEY) + '?t=' + Date.now();
  let bundle;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000), cache: 'no-store' });
    if (res.status === 404 || res.status === 403) return { ok: false, skipped: 'no-snapshot' };
    if (!res.ok) return { ok: false, error: `GET ${res.status}` };
    bundle = await res.json();
  } catch (e) { return { ok: false, error: e.message }; }
  if (!bundle || typeof bundle.files !== 'object') return { ok: false, error: 'bad-bundle' };

  const rootAbs = resolve(root);
  let count = 0;
  for (const [p, content] of Object.entries(bundle.files)) {
    const abs = resolve(rootAbs, p);
    if (abs !== rootAbs && !abs.startsWith(rootAbs + '/')) continue;   // защита от выхода за root
    if (typeof content !== 'string') continue;
    try { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, content); count++; }
    catch { /* отдельный файл не записался — не валим весь restore */ }
  }
  return { ok: true, count, createdAt: bundle.createdAt };
}
