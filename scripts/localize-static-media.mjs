#!/usr/bin/env node
/**
 * localize-static-media.mjs — скачивает картинки, ЗАХАРДКОЖЕННЫЕ прямо в HTML
 * (чат/сообщения/подарки), в assets/embedded/ и переписывает ссылки на локальные.
 *
 *   node scripts/localize-static-media.mjs            — скачать + переписать HTML
 *   node scripts/localize-static-media.mjs --check     — только показать, что скачалось бы/протухло
 *
 * В отличие от fetch-* эти картинки не из Google-таблицы, а вшиты в разметку
 * (gif-открытки, подарки). Скрипт находит в перечисленных файлах внешние ссылки
 * на медиа (по расширению), скачивает их и подменяет URL → assets/embedded/<hash>.<ext>.
 * Гифки сохраняются как .gif (анимация не теряется). Манифест — data/embedded-media.json.
 *
 * ВАЖНО: после первого прогона ссылки в HTML уже локальные, повторный запуск
 * ничего нового не находит (это разовая «заморозка», источник больше не нужен).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createMediaCache } from './lib/media-cache.mjs';

const CHECK_ONLY = process.argv.includes('--check');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Файлы со статичными внешними картинками (все в корне → assets/embedded/ резолвится напрямую).
const FILES = ['chat.html', 'send-gift.html', 'gifts.html', 'lenta-q3.html', 'today.html'];

// Внешний URL считаем «нашим медиа», если он на картинку/видео по расширению.
// Шрифты/библиотеки/placeholder-аватары не трогаем.
const MEDIA_RE = /\.(jpe?g|png|gif|webp|avif|bmp|mp4|webm|mov)(\?|#|$)/i;
const SKIP_RE = /(?:fonts\.gstatic|jsdelivr|pravatar\.cc|gstatic\.com)/i;

/** Все внешние URL-кандидаты из HTML (src="…", url('…'), значения в JS-строках). */
function findUrls(html) {
  const urls = new Set();
  const re = /https?:\/\/[^\s"'`)<>]+/g;
  let m;
  while ((m = re.exec(html))) {
    const u = m[0].replace(/[.,;]+$/, '');
    if (SKIP_RE.test(u)) continue;
    if (MEDIA_RE.test(u)) urls.add(u);
  }
  return [...urls];
}

const cache = createMediaCache({
  root: ROOT, dirRel: 'assets/embedded',
  manifestPath: resolve(ROOT, 'data/embedded-media.json'), dryRun: CHECK_ONLY,
});

let totalReplaced = 0;
for (const rel of FILES) {
  const file = resolve(ROOT, rel);
  let html;
  try { html = readFileSync(file, 'utf8'); } catch { console.warn(`  ⚠️  нет файла ${rel} — пропуск`); continue; }
  const urls = findUrls(html);
  if (!urls.length) { console.log(`  · ${rel}: внешних картинок не найдено`); continue; }

  let replaced = 0;
  for (const url of urls) {
    const local = await cache.resolveUrl(url);
    if (local !== url) {                       // удалось локализовать
      html = html.split(url).join(local);
      replaced++;
    }
  }
  totalReplaced += replaced;
  if (!CHECK_ONLY && replaced) writeFileSync(file, html);
  console.log(`  ${replaced ? '🖼' : '⚠️'} ${rel}: найдено ${urls.length}, локализовано ${replaced}`);
}

// prune:false — папка общая для разных HTML, не чистим по одному прогону.
cache.save({ prune: false });
console.log('  ' + cache.report());
console.log(CHECK_ONLY
  ? '(--check) Ничего не записано.'
  : `✓ Локализовано ${totalReplaced} ссылок → assets/embedded/ (манифест data/embedded-media.json)`);
