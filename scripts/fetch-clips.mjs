#!/usr/bin/env node
/**
 * fetch-clips.mjs — выкачивает лист «Клипы» из Google-таблицы в
 *                   data/clips.json + data/clips.js
 *
 *   node scripts/fetch-clips.mjs
 *
 * Требование: таблица открыта «всем, у кого есть ссылка» (просмотр).
 * Если скрипт не достаёт таблицу (HTTP 401/403) — обнови через Google Drive MCP
 * (см. скилл fetch-clips, путь B).
 *
 * Лист «Клипы» (gid 1662648328 → см. ниже), колонки:
 *   id · тип · автор · заголовок · текст · лайки · комменты · репосты
 *
 *   id:    можно НЕ заполнять — нумеруется автоматически «clip-N» по порядку
 *          строк-клипов. Заданный вручную id уважается (обратная совместимость).
 *   тип:   'clip' — обычный клип; 'vvz-clip' — слайд «Возможно, вы знакомы».
 *   автор: id человека из листа «Люди» (имя/аватар резолвятся на странице
 *          через DS_PEOPLE — здесь храним только id).
 *   видео: по умолчанию assets/clips/<id>.mp4; если задан столбец «видео»
 *          (прямая ссылка или имя файла) — берём его.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createMediaCache } from './lib/media-cache.mjs';
import { createSyncGate } from './lib/sheet-cache.mjs';

const SPREADSHEET_ID = '1Ctwjp2J0HSmvb6kL4NoDqaB9W4QfdAXXDnzyBDLYZ7Y';
const SHEET_GID = '1801786104';            // вкладка «Клипы»
const SHEET_NAME = 'Клипы';
const FORCE = process.argv.includes('--force');   // пересобрать, даже если лист не менялся

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const csvUrl =
  `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
  `?tqx=out:csv&gid=${encodeURIComponent(SHEET_GID)}`;

/** Простой парсер CSV (поддерживает кавычки и запятые внутри полей). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const clean = (s) => String(s || '').trim();

async function main() {
  console.log(`→ Тяну «${SHEET_NAME}» из таблицы…`);
  const res = await fetch(csvUrl);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} — проверь доступ к таблице и gid «${SHEET_GID}».`);
  }
  const csvText = await res.text();
  const gate = createSyncGate({ root: ROOT, key: 'clips',
    codeDeps: [fileURLToPath(import.meta.url), resolve(__dirname, 'lib/media-cache.mjs')] });
  if (gate.unchanged(csvText) && !FORCE) {
    console.log(`✓ «${SHEET_NAME}» без изменений — пропускаю (--force чтобы пересобрать).`);
    return;
  }
  const rows = parseCsv(csvText);
  if (!rows.length) throw new Error('Пустой лист.');

  // Заголовок → индексы колонок по именам.
  const header = rows[0].map((h) => clean(h).toLowerCase());
  const col = (name) => header.indexOf(name);
  const iId = col('id'), iType = col('тип'), iAuthor = col('автор');
  const iVideo = col('видео');                       // опционально
  const iLikes = col('лайки'), iComments = col('комменты'), iReshares = col('репосты');
  const iTitle = col('заголовок'), iText = col('текст');
  if (iId < 0 || iType < 0) {
    throw new Error('Нет колонок «id»/«тип». Это точно лист «Клипы»?');
  }

  const clips = [];
  let clipSeq = 0;                                    // авто-нумерация клипов по порядку
  for (const r of rows.slice(1)) {
    const id = clean(r[iId]);
    const type = clean(r[iType]);
    if (!id && !type) continue;                       // пустая строка
    if (type === 'vvz-clip') {
      clips.push({ id, type: 'vvz-clip' });           // у ВВЗ-слайда id не используется
      continue;
    }
    if (type !== 'clip') continue;                    // прочие типы игнорируем
    clipSeq++;
    const clip = {
      // id можно не заполнять в таблице — авто «clip-N» по порядку строк-клипов.
      // Если id задан вручную — берём его (обратная совместимость).
      id: id || `clip-${clipSeq}`,
      type: 'clip',
      author: clean(r[iAuthor]),
      likes: clean(r[iLikes]),
      comments: clean(r[iComments]),
      reshares: clean(r[iReshares])
    };
    if (iVideo >= 0 && clean(r[iVideo])) clip.video = clean(r[iVideo]);
    const title = iTitle >= 0 ? clean(r[iTitle]) : '';
    const text = iText >= 0 ? clean(r[iText]) : '';
    if (title) clip.title = title;
    if (text) clip.text = text;
    clips.push(clip);
  }

  // Видео по прямым ссылкам качаем в репо (assets/clips/<hash>.ext) — хэш-проверка
  // «изменилось ли», старое чистится при prune. Файлы по конвенции assets/clips/<id>.mp4
  // (вне манифеста) кэш не трогает. Голые имена/локальные пути оставляем как есть.
  const cache = createMediaCache({ root: ROOT, dirRel: 'assets/clips',
    manifestPath: resolve(ROOT, 'data/clips-media.json') });
  for (const c of clips) {
    if (c.video && /^https?:\/\//.test(c.video)) c.video = await cache.resolveUrl(c.video);
  }
  cache.save();
  console.log('  ' + cache.report());

  // data/clips.json
  writeFileSync(
    resolve(ROOT, 'data/clips.json'),
    JSON.stringify({
      _readme: {
        'источник': `Google-таблица, лист «${SHEET_NAME}» (gid ${SHEET_GID})`,
        'как_обновить': 'node scripts/fetch-clips.mjs (или скилл fetch-clips)',
        'колонки': 'id · тип · автор · заголовок · текст · лайки · комменты · репосты',
        'видео': 'файл assets/clips/<id>.mp4 (или столбец «видео» с прямой ссылкой)',
        'автор': 'id человека из листа «Люди» — имя/аватар резолвятся через DS_PEOPLE'
      },
      clips
    }, null, 2) + '\n'
  );

  // data/clips.js
  writeFileSync(
    resolve(ROOT, 'data/clips.js'),
    '/* Сгенерировано scripts/fetch-clips.mjs из листа «Клипы» — НЕ редактировать вручную. */\n' +
    'window.DS_CLIPS_DATA = ' + JSON.stringify(clips, null, 2) + ';\n'
  );

  gate.commit();
  console.log(`✓ Записал ${clips.length} строк → data/clips.json + data/clips.js`);
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
