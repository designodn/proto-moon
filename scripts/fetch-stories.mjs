#!/usr/bin/env node
/**
 * fetch-stories.mjs — выкачивает лист «Сториз» (Моменты) из Google-таблицы в
 *                     data/stories.json + data/stories.js
 *
 *   node scripts/fetch-stories.mjs
 *
 * Требование: таблица открыта «всем, у кого есть ссылка» (просмотр).
 * Если скрипт не достаёт таблицу (HTTP 401/403) — обнови через Google Drive MCP.
 *
 * Лист «Сториз» (gid 907583109), колонки:
 *   id · тип · автор · фото для сториз
 *
 *   тип:   default  — обычная сториз (картинка из «фото для сториз»);
 *          birthday — сториз именинника (фото-фон + «Поздравить»);
 *          vvz      — «Возможно, вы знакомы» (сетка 2×2 карточек).
 *          (принимаются и русские синонимы: обычная / др / ввз)
 *   автор: id человека из листа «Люди». Для vvz — СПИСОК id через запятую
 *          (по одному на карточку 2×2). Имя/аватар резолвятся на странице
 *          через DS_PEOPLE — здесь храним только id.
 *   фото:  только для обычной — прямая ссылка на картинку слайда.
 *
 * JSON зеркалит лист; дефолты (заголовок ВВЗ, CTA «Поздравить»/«Показать всех»,
 * длительность) и резолв людей применяет страница при рендере через moment.js.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createMediaCache } from './lib/media-cache.mjs';
import { createSyncGate } from './lib/sheet-cache.mjs';

const CHECK_ONLY = process.argv.includes('--check');
const FORCE = process.argv.includes('--force');   // пересобрать, даже если лист не менялся
const SPREADSHEET_ID = '1Ctwjp2J0HSmvb6kL4NoDqaB9W4QfdAXXDnzyBDLYZ7Y';
const SHEET_GID = '907583109';             // вкладка «Сториз»
const SHEET_NAME = 'Сториз';

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

// Канонический тип: default→regular, birthday→bday, vvz→vvz (+ русские синонимы).
const TYPE_MAP = {
  'default': 'regular', 'обычная': 'regular', 'regular': 'regular',
  'birthday': 'bday', 'др': 'bday', 'bday': 'bday',
  'vvz': 'vvz', 'ввз': 'vvz'
};

async function main() {
  console.log(`→ Тяну «${SHEET_NAME}» из таблицы…`);
  const res = await fetch(csvUrl);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} — проверь доступ к таблице и gid «${SHEET_GID}».`);
  }
  const csvText = await res.text();
  const gate = createSyncGate({ root: ROOT, key: 'stories',
    codeDeps: [fileURLToPath(import.meta.url), resolve(__dirname, 'lib/media-cache.mjs')] });
  if (gate.unchanged(csvText) && !FORCE && !CHECK_ONLY) {
    console.log(`✓ «${SHEET_NAME}» без изменений — пропускаю (--force чтобы пересобрать).`);
    return;
  }
  const rows = parseCsv(csvText);
  if (!rows.length) throw new Error('Пустой лист.');

  // Заголовок → индексы колонок по именам.
  const header = rows[0].map((h) => clean(h).toLowerCase());
  const col = (name) => header.indexOf(name);
  const iId = col('id'), iType = col('тип'), iAuthor = col('автор');
  const iPhoto = col('фото для сториз');
  if (iType < 0 || iAuthor < 0) {
    throw new Error('Нет колонок «тип»/«автор». Это точно лист «Сториз»?');
  }

  const stories = [];
  let auto = 0;
  for (const r of rows.slice(1)) {
    const rawType = clean(r[iType]);
    const author = iAuthor >= 0 ? clean(r[iAuthor]) : '';
    if (!rawType && !author) continue;                  // пустая строка
    const type = TYPE_MAP[rawType.toLowerCase()];
    if (!type) continue;                                // незнакомый тип — пропуск

    auto++;
    const id = (iId >= 0 && clean(r[iId])) || `story-${auto}`;
    const photo = iPhoto >= 0 ? clean(r[iPhoto]) : '';

    if (type === 'vvz') {
      // «автор» — список id людей через запятую → карточки 2×2.
      const people = author.split(',').map((s) => s.trim()).filter(Boolean);
      stories.push({ id, type: 'vvz', people });
      continue;
    }

    const story = { id, type, author };
    // «фото для сториз» — картинка ВНУТРИ сториз (контент слайда):
    //   regular → сам слайд; bday → фон именинного слайда (иначе фото автора).
    if (photo) story.image = photo;
    stories.push(story);
  }

  // Кэшируем картинки слайдов локально (stories.js грузится в lenta-q3.html,
  // корень) — внешние ссылки протухают, копия остаётся. Аватары авторов
  // резолвятся через DS_PEOPLE и уже локальные.
  const cache = createMediaCache({
    root: ROOT, dirRel: 'assets/stories',
    manifestPath: resolve(ROOT, 'data/stories-media.json'), dryRun: CHECK_ONLY,
  });
  for (const s of stories) if (s.image) s.image = await cache.resolveUrl(s.image);
  cache.save();
  console.log('  ' + cache.report());

  if (CHECK_ONLY) { console.log('(--check) Ссылки проверены, ничего не записано.'); return; }

  const readme = {
    'источник': `Google-таблица, лист «${SHEET_NAME}» (gid ${SHEET_GID})`,
    'как_обновить': 'node scripts/fetch-stories.mjs (или скилл fetch-stories)',
    'колонки': 'id · тип · автор · фото для сториз',
    'типы': 'regular (default/обычная) · bday (birthday/др) · vvz (ввз)',
    'автор': 'id человека из листа «Люди» (для vvz — список id через запятую). Имя/аватар резолвятся через DS_PEOPLE.',
    'фото': 'картинка ВНУТРИ сториз (контент слайда). regular → сам слайд; bday → фон именинного слайда (если пусто — фото автора); для vvz не нужно',
    'дефолты': 'заголовок ВВЗ, CTA «Поздравить»/«Показать всех», длительность кадра — применяет страница при рендере (moment.js)'
  };

  writeFileSync(
    resolve(ROOT, 'data/stories.json'),
    JSON.stringify({ _readme: readme, stories }, null, 2) + '\n'
  );

  writeFileSync(
    resolve(ROOT, 'data/stories.js'),
    '/* Сгенерировано scripts/fetch-stories.mjs из листа «Сториз» — НЕ редактировать вручную. */\n' +
    'window.DS_STORIES = ' + JSON.stringify(stories, null, 2) + ';\n'
  );

  gate.commit();
  console.log(`✓ Записал ${stories.length} строк → data/stories.json + data/stories.js`);
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
