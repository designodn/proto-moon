/**
 * media-cache.mjs — общий кэш медиа для скриптов сбора (fetch-*).
 *
 * Зачем: ленты хранят прямые ссылки на чужие CDN (okcdn.ru, gstatic, pinimg…),
 * которые со временем протухают. Хелпер скачивает картинку/видео локально и
 * возвращает путь к копии; в манифесте (data/<feed>-media.json) держит исходный
 * URL + хэш, чтобы на каждом прогоне понимать, что изменилось.
 *
 * Ключ записи — первые 16 символов sha256(URL): одинаковые ссылки переиспользуют
 * один файл, смена ссылки в таблице даёт новый файл (старый удаляется при prune).
 *
 *   import { createMediaCache } from './lib/media-cache.mjs';
 *   const cache = createMediaCache({ root, dirRel: 'assets/tribune',
 *                                    manifestPath: resolve(root,'data/tribune-media.json') });
 *   post.photos = await Promise.all(post.photos.map(u => cache.resolveUrl(u)));
 *   cache.save();                 // пишет манифест + удаляет осиротевшие файлы
 *   console.log(cache.report());  // строка-сводка
 *
 * Статусы: ok (скачано) · stale (источник умер, оставлена копия) · dead (умер, копии нет).
 * При dead возвращаем исходный внешний URL — «хуже, чем было» не делаем.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/** Расширение по Content-Type, фолбэк — по URL. */
function extFor(contentType, url) {
  const ct = (contentType || '').toLowerCase();
  const map = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'image/gif': 'gif', 'image/avif': 'avif', 'image/bmp': 'bmp', 'image/svg+xml': 'svg',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  };
  for (const k in map) if (ct.startsWith(k)) return map[k];
  const m = (url || '').split(/[?#]/)[0].toLowerCase().match(/\.(jpe?g|png|webp|gif|avif|bmp|svg|mp4|webm|mov|m4v)$/);
  if (m) return m[1] === 'jpeg' ? 'jpg' : m[1];
  return 'jpg';
}

function mediaKind(contentType, url) {
  const ct = (contentType || '').toLowerCase();
  if (ct.startsWith('image/')) return 'image';
  if (ct.startsWith('video/')) return 'video';
  const path = (url || '').split(/[?#]/)[0].toLowerCase();
  if (/\.(jpe?g|png|webp|gif|avif|bmp|svg)$/.test(path)) return 'image';
  if (/\.(mp4|webm|mov|m4v)$/.test(path)) return 'video';
  return null;
}

export function createMediaCache({ root, dirRel, manifestPath, dryRun = false }) {
  const dir = resolve(root, dirRel);
  let manifest = {};
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { /* первый запуск */ }

  const next = {};
  const used = new Set();              // имена файлов, на которые сослались в этом прогоне
  const done = new Map();              // url → результат (дедуп в рамках прогона)
  const stats = { same: 0, fresh: 0, changed: 0, stale: 0, dead: 0 };
  const now = new Date().toISOString();

  async function resolveUrl(url) {
    if (!url || !/^https?:\/\//.test(url)) return url;   // пустые/локальные — как есть
    if (done.has(url)) return done.get(url);

    const key = sha(url).slice(0, 16);
    const prev = manifest[key];

    let dl = null;
    try {
      // User-Agent: часть хостов (wikimedia и пр.) отдаёт 403 на «голый» fetch.
      const res = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; proto-moon/1.0)' },
      });
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        const kind = mediaKind(ct, url);
        if (kind) {
          const bytes = Buffer.from(await res.arrayBuffer());
          if (bytes.length) dl = { kind, ext: extFor(ct, url), hash: sha(bytes), bytes };
        }
      }
    } catch { /* падаем в ветку «источник недоступен» */ }

    let result;
    if (dl) {
      const file = `${key}.${dl.ext}`;
      if (!prev) stats.fresh++;
      else if (prev.hash !== dl.hash) stats.changed++;
      else stats.same++;
      if (!dryRun) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(resolve(dir, file), dl.bytes);
      }
      next[key] = { src: url, file, type: dl.kind, hash: dl.hash, status: 'ok', checkedAt: now };
      used.add(file);
      result = `${dirRel}/${file}`;
    } else if (prev && prev.file && existsSync(resolve(dir, prev.file))) {
      // источник умер, но локальная копия есть — оставляем её
      stats.stale++;
      next[key] = { ...prev, src: url, status: 'stale', checkedAt: now };
      used.add(prev.file);
      result = `${dirRel}/${prev.file}`;
    } else {
      // умер и копии нет — оставляем внешний URL (не делаем хуже)
      stats.dead++;
      next[key] = { src: url, file: null, type: null, hash: null, status: 'dead', checkedAt: now };
      result = url;
    }
    done.set(url, result);
    return result;
  }

  function save({ prune = true } = {}) {
    if (dryRun) return;
    if (prune && existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (!used.has(f)) { try { unlinkSync(resolve(dir, f)); } catch { /* ignore */ } }
      }
    }
    writeFileSync(manifestPath, JSON.stringify(next, null, 2) + '\n');
  }

  function report() {
    const dead = stats.dead ? ` · ✗ ${stats.dead} битых (оставлен внешний URL)` : '';
    return `медиа: 🖼 ${stats.same} без изм · 🆕 ${stats.fresh} новых · ♻️ ${stats.changed} обновлено · ⚠️ ${stats.stale} протухло${dead}`;
  }

  return { resolveUrl, save, report, stats };
}
