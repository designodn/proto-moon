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
import { isUploadConfigured, putAtKey, publicUrlFor, mimeForExt, bucketConfig, existsAtKey } from './bucket.mjs';

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// sharp опционален: если не установлен — просто не жмём (репо остаётся рабочим).
let sharp = null;
try { sharp = (await import('sharp')).default; }
catch { console.warn('[media] sharp не установлен — картинки без сжатия (npm i sharp)'); }

// Параметры сжатия. Прототип мобильный → 1600px по ширине с запасом на ретину
// хватает; webp q80 — хороший баланс размер/качество.
const MAX_W = 1600;
const WEBP_Q = 80;

/** Сжимает картинку: ресайз до MAX_W (без апскейла) + перекодирование в webp.
 *  ВСЕГДА отдаёт webp — png/jpg на диске не храним. Не трогает только svg
 *  (вектор) и анимацию (gif/animated webp — потеряли бы кадры).
 *  Возвращает { bytes, ext:'webp' } или null (sharp нет / не растровая / ошибка). */
export async function compressImage(buf, ext) {
  if (!sharp || ext === 'svg') return null;
  try {
    const img = sharp(buf, { failOn: 'none' });
    const meta = await img.metadata();
    if (meta.pages && meta.pages > 1) return null;          // анимированный gif/webp — не трогаем
    let pipe = img.rotate();                                  // учесть EXIF-ориентацию
    if (meta.width && meta.width > MAX_W)
      pipe = pipe.resize({ width: MAX_W, withoutEnlargement: true });
    const out = await pipe.webp({ quality: WEBP_Q }).toBuffer();
    return { bytes: out, ext: 'webp' };                      // всегда webp
  } catch { return null; }
}

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

/** Определяет реальный тип по сигнатуре файла (magic bytes) — надёжнее, чем
 *  Content-Type/расширение: хосты часто отдают gif-имя для JPEG-байтов и наоборот.
 *  → { ext, kind } или null, если сигнатура не распознана. */
function sniff(buf) {
  if (!buf || buf.length < 4) return null;
  const b = buf;
  const ascii = (i, s) => b.toString('latin1', i, i + s.length) === s;
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { ext: 'jpg', kind: 'image' };
  if (b[0] === 0x89 && ascii(1, 'PNG')) return { ext: 'png', kind: 'image' };
  if (ascii(0, 'GIF8')) return { ext: 'gif', kind: 'image' };
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return { ext: 'webp', kind: 'image' };
  if (b[0] === 0x42 && b[1] === 0x4D) return { ext: 'bmp', kind: 'image' };
  if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return { ext: 'webm', kind: 'video' };
  // ISO-BMFF (ftyp): mp4/mov/avif различаем по brand'у в байтах 8..12.
  if (ascii(4, 'ftyp')) {
    const brand = b.toString('latin1', 8, 12);
    if (brand.startsWith('qt')) return { ext: 'mov', kind: 'video' };
    if (brand.startsWith('avif') || brand.startsWith('avis')) return { ext: 'avif', kind: 'image' };
    return { ext: 'mp4', kind: 'video' };
  }
  // SVG — текстовый: ищем <svg в начале (с возможным BOM/пробелами/XML-прологом).
  const headTxt = b.toString('latin1', 0, Math.min(b.length, 256)).toLowerCase();
  if (/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--.*?-->\s*)?<svg[\s>]/s.test(headTxt)) return { ext: 'svg', kind: 'image' };
  return null;
}

export function createMediaCache({ root, dirRel, manifestPath, dryRun = false }) {
  const dir = resolve(root, dirRel);
  let manifest = {};
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { /* первый запуск */ }

  // Файлы, которыми кэш управлял РАНЕЕ (из старого манифеста). Прунить можно
  // только их: статические ассеты в той же папке (напр. assets/gifts/thanks-*.gif,
  // на которые ссылается gifts.html напрямую) кэш не создавал и трогать не должен.
  const managed = new Set();
  for (const k in manifest) {
    const f = manifest[k] && manifest[k].file;
    if (f) managed.add(f);
  }

  const next = {};
  const used = new Set();              // имена файлов, на которые сослались в этом прогоне
  const done = new Map();              // url → результат (дедуп в рамках прогона)
  const stats = { same: 0, fresh: 0, changed: 0, stale: 0, dead: 0 };
  const now = new Date().toISOString();

  // Режим хранения. Если бакет настроен (env UPLOADS_*) — заливаем медиа в облако
  // и возвращаем публичный URL; репозиторий не растёт. Иначе — как раньше: качаем
  // в assets/ и возвращаем относительный путь (локальная разработка без ключей).
  const bucketMode = isUploadConfigured();

  async function resolveUrl(url) {
    if (!url || !/^https?:\/\//.test(url)) return url;   // пустые/локальные — как есть
    // Наш собственный бакет загрузок — надёжное хранилище (в отличие от чужих CDN,
    // которые протухают). Такие ссылки НЕ качаем в репо: оставляем как есть, чтобы
    // картинки/клипы дизайнеров жили в облаке и не раздували репозиторий.
    // Сверяемся с тем же базовым URL, по которому САМИ пишем ссылки
    // (publicUrlFor → bucketConfig().publicBase), а не с сырым env: иначе при
    // незаданном UPLOADS_PUBLIC_BASE (база выводится из имени бакета) passthrough
    // не узнал бы собственные ссылки и пере-качивал бы их.
    const uploadsBase = bucketConfig().publicBase;
    if (uploadsBase && url.startsWith(uploadsBase)) return url;
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
        const bytes = Buffer.from(await res.arrayBuffer());
        // Реальный тип — по содержимому (magic bytes). Принимаем только если байты
        // ОПОЗНАНЫ как медиа, либо Content-Type явно image/video И это не HTML
        // (анти-хотлинк часто отдаёт html-«заглушку» по image-подобному URL).
        const sig = sniff(bytes);
        const ctMedia = ct.startsWith('image/') || ct.startsWith('video/');
        const looksHtml = /^\s*</.test(bytes.toString('latin1', 0, 64));
        if (bytes.length && (sig || (ctMedia && !looksHtml))) {
          const kind = sig?.kind || (ct.startsWith('video/') ? 'video' : 'image');
          // hash считаем по ИСХОДНЫМ байтам (детект изменения источника), а на диск
          // кладём сжатую версию. Так смена настроек сжатия не ломает change-detection.
          dl = { kind, ext: sig?.ext || extFor(ct, url), hash: sha(bytes), bytes };
          if (kind === 'image') {
            const c = await compressImage(bytes, dl.ext);
            if (c) { dl.bytes = c.bytes; dl.ext = c.ext; }
          }
        }
      }
    } catch { /* падаем в ветку «источник недоступен» */ }

    let result;
    if (dl) {
      const file = `${key}.${dl.ext}`;
      if (!prev) stats.fresh++;
      else if (prev.hash !== dl.hash) stats.changed++;
      else stats.same++;
      next[key] = { src: url, file, type: dl.kind, hash: dl.hash, status: 'ok', checkedAt: now };
      if (bucketMode) {
        // Заливаем в бакет под путём assets/<dir>/<file>; пере-загрузку пропускаем,
        // если содержимое не менялось (тот же hash и файл уже залит ранее).
        const objKey = `${dirRel}/${file}`;
        const unchanged = prev && prev.hash === dl.hash && prev.file === file && prev.status === 'ok';
        if (!unchanged && !dryRun) await putAtKey(objKey, dl.bytes, mimeForExt(dl.ext));
        result = publicUrlFor(objKey);
      } else {
        if (!dryRun) {
          mkdirSync(dir, { recursive: true });
          writeFileSync(resolve(dir, file), dl.bytes);
        }
        used.add(file);
        result = `${dirRel}/${file}`;
      }
    } else if (prev && prev.file && prev.status !== 'dead' &&
               (bucketMode ? await existsAtKey(`${dirRel}/${prev.file}`) : existsSync(resolve(dir, prev.file)))) {
      // источник умер, но копия есть (на диске или реально в бакете) — оставляем её.
      stats.stale++;
      if (bucketMode) {
        // копия уже в бакете (была залита ранее) — отдаём её URL
        next[key] = { ...prev, src: url, status: 'stale', checkedAt: now };
        result = publicUrlFor(`${dirRel}/${prev.file}`);
      } else {
        // локальная копия: заодно дожимаем старые png/jpg в webp (храним только
        // webp), хэш-источника не трогаем.
        let file = prev.file;
        const m = /\.(png|jpe?g)$/i.exec(file);
        if (m && sharp && !dryRun) {
          const c = await compressImage(readFileSync(resolve(dir, file)), m[1].toLowerCase());
          if (c) {
            const nf = `${key}.${c.ext}`;
            if (nf !== file) { try { unlinkSync(resolve(dir, file)); } catch { /* ignore */ } }
            file = nf;
            writeFileSync(resolve(dir, file), c.bytes);
          }
        }
        next[key] = { ...prev, file, src: url, status: 'stale', checkedAt: now };
        used.add(file);
        result = `${dirRel}/${file}`;
      }
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
    // Прун локальных осиротевших файлов — только в дисковом режиме. В облачном
    // режиме локальной папки нет, а осиротевшие объекты в бакете безвредны.
    if (prune && !bucketMode && existsSync(dir)) {
      // Удаляем ТОЛЬКО осиротевшие файлы кэша (были в старом манифесте, в этом
      // прогоне не использованы). Файлы вне manifest — не наши, не трогаем.
      for (const f of readdirSync(dir)) {
        if (managed.has(f) && !used.has(f)) {
          try { unlinkSync(resolve(dir, f)); } catch { /* ignore */ }
        }
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
