#!/usr/bin/env node
/**
 * migrate-clips.mjs — разовый перенос клипов из репо в бакет загрузок.
 *
 * Зачем: сейчас MP4 лежат прямо в assets/clips/ и раздувают репозиторий
 * (~37 МБ). Этот скрипт заливает их в S3-бакет (тот же, что у страницы
 * /content) и печатает готовые публичные URL. Дальше:
 *   1) впиши эти URL в столбец «видео» соответствующих строк листа «Клипы»
 *      (сопоставляй по имени файла: clip-1.mp4 → клип с id «clip-1»);
 *   2) пересобери: node scripts/fetch-clips.mjs --force
 *      (ссылки на наш бакет media-cache не качает — passthrough);
 *   3) удали локальные файлы: git rm assets/clips/*.mp4 && git commit.
 *
 * Запуск (нужны те же env, что и у загрузки — UPLOADS_BUCKET, ключи S3 и т.д.):
 *   node scripts/migrate-clips.mjs
 *
 * Ничего не удаляет и не правит таблицу — только заливает и печатает URL.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname, basename } from 'node:path';
import { isUploadConfigured, putContentAddressed } from './lib/bucket.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CLIPS_DIR = resolve(ROOT, 'assets/clips');

const CT = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };

async function main() {
  if (!isUploadConfigured()) {
    console.error('✗ Не настроен бакет. Задайте env UPLOADS_BUCKET и ключи S3 (см. UPLOADS.md).');
    process.exit(1);
  }

  let files;
  try {
    files = readdirSync(CLIPS_DIR).filter((f) => CT[extname(f).toLowerCase()]);
  } catch {
    console.error(`✗ Нет каталога ${CLIPS_DIR}.`);
    process.exit(1);
  }
  if (!files.length) {
    console.log('Нет видеофайлов для переноса.');
    return;
  }

  console.log(`→ Заливаю ${files.length} файл(ов) в бакет…\n`);
  const rows = [];
  for (const f of files) {
    const ext = extname(f).toLowerCase().slice(1);
    const bytes = readFileSync(resolve(CLIPS_DIR, f));
    const { url } = await putContentAddressed(bytes, ext, CT[extname(f).toLowerCase()]);
    const id = basename(f, extname(f));   // clip-1.mp4 → clip-1
    rows.push({ id, file: f, url });
    console.log(`  ✓ ${f}  →  ${url}`);
  }

  console.log('\nВставь в столбец «видео» листа «Клипы» (сопоставь по id):\n');
  for (const r of rows) console.log(`  ${r.id}\t${r.url}`);
  console.log('\nДальше: node scripts/fetch-clips.mjs --force, затем git rm assets/clips/*.mp4');
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
