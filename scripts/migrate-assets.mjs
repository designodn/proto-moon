#!/usr/bin/env node
/**
 * migrate-assets.mjs — разовый перенос контент-картинок из репо в бакет.
 *
 * Зачем: до перехода на облако все скачанные картинки лежали в assets/<dir>/.
 * Часть из них уже не пере-скачать (источник умер, есть только локальная копия).
 * Поэтому переносим существующие файлы в бакет ПОД ТЕМИ ЖЕ путями, которые
 * пайплайн будет отдавать после включения облачного режима (assets/<dir>/<file>).
 *
 * Берём только то, что числится в манифестах *-media.json (то, чем управляет
 * media-cache). Статические ассеты (иконки, koleso, today, embedded, new-vision)
 * НЕ трогаем — они остаются в репо как часть UI.
 *
 * Запуск (нужны env UPLOADS_*, см. UPLOADS.md):
 *   node scripts/migrate-assets.mjs            # залить
 *   node scripts/migrate-assets.mjs --dry-run  # показать, что будет залито
 *
 * Идемпотентно: повторный запуск просто перезальёт те же ключи. После проверки
 * сайта на облаке убери файлы из git (см. UPLOADS.md).
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname } from 'node:path';
import { isUploadConfigured, putAtKey, publicUrlFor, mimeForExt } from './lib/bucket.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

// Контент-директории и их манифесты (то, чем управляет media-cache).
// embedded НЕ включён: там почти всё — статика, зашитая в HTML напрямую.
const MAP = [
  ['assets/people',        'data/people-media.json'],
  ['assets/q3',            'data/q3-media.json'],
  ['assets/tribune',       'data/tribune-media.json'],
  ['assets/activity',      'data/activity-feed-media.json'],
  ['assets/activity-pins', 'data/activity-pins-media.json'],
  ['assets/around-you',    'data/around-you-media.json'],
  ['assets/profile',       'data/profile-media.json'],
  ['assets/gifts',         'data/gifts-media.json'],
  ['assets/marathon',      'data/marathon-media.json'],
  ['assets/stories',       'data/stories-media.json'],
  ['assets/feed',          'data/feed-media.json'],
];

function loadManifest(rel) {
  try { return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8')); }
  catch { return {}; }
}

async function main() {
  if (!DRY && !isUploadConfigured()) {
    console.error('✗ Не настроен бакет. Задайте env UPLOADS_* (см. UPLOADS.md) или запусти с --dry-run.');
    process.exit(1);
  }

  let uploaded = 0, missing = 0, total = 0;
  for (const [dirRel, manifestRel] of MAP) {
    const manifest = loadManifest(manifestRel);
    for (const k of Object.keys(manifest)) {
      const e = manifest[k];
      if (!e || !e.file || e.status === 'dead') continue;
      total++;
      const localPath = resolve(ROOT, dirRel, e.file);
      const objKey = `${dirRel}/${e.file}`;
      if (!existsSync(localPath)) {
        missing++;
        console.warn(`  ⚠ нет файла: ${objKey} (источник: ${e.src || '—'})`);
        continue;
      }
      if (DRY) {
        console.log(`  · ${objKey}  →  ${publicUrlFor(objKey)}`);
        uploaded++;
        continue;
      }
      const bytes = readFileSync(localPath);
      await putAtKey(objKey, bytes, mimeForExt(extname(e.file).slice(1)));
      uploaded++;
      if (uploaded % 25 === 0) console.log(`  …залито ${uploaded}`);
    }
  }

  console.log(`\n${DRY ? '[dry-run] ' : ''}Готово: ${uploaded}/${total} файлов` +
    (missing ? `, пропущено отсутствующих: ${missing}` : '') + '.');
  if (!DRY) {
    console.log('Проверь сайт на облаке (включи env UPLOADS_* для пайплайна, прогони синк),');
    console.log('затем убери контент-папки из git — см. UPLOADS.md.');
  }
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
