#!/usr/bin/env node
/**
 * fetch-people.mjs — выкачивает лист «Люди» из Google-таблицы в data/people.json + data/people.js
 *
 *   node scripts/fetch-people.mjs
 *
 * Требование: таблица должна быть открыта «всем, у кого есть ссылка» (просмотр).
 * Источник: https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit
 *
 * Для каждой ссылки на фото скрипт проверяет Content-Type:
 *   image/*  → media: "image"
 *   video/*  → media: "video"  (живое фото — в прототипе рендерится <video>)
 *   иначе/нет → media: null    (заглушка / битая ссылка)
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SPREADSHEET_ID = '1Ctwjp2J0HSmvb6kL4NoDqaB9W4QfdAXXDnzyBDLYZ7Y';
const SHEET_NAME = 'Люди';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// gviz отдаёт CSV по имени листа
const csvUrl =
  `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
  `?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;

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

/** Возраст: "70 лет" / "70" → 70; пусто → null */
function parseAge(raw) {
  const m = String(raw || '').match(/\d+/);
  return m ? Number(m[0]) : null;
}

/** Город: "нет"/пусто → "", иначе с заглавной буквы */
function normCity(raw) {
  const s = String(raw || '').trim();
  if (!s || s.toLowerCase() === 'нет') return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Определяет тип медиа: сперва по Content-Type, при неудаче — по расширению.
 *  Фолбэк нужен для хостов с бот-защитой (отдают 503/403/HTML вместо image/*),
 *  где ссылка всё равно ведёт на картинку/видео (напр. fiesta.ru). */
async function detectMedia(url) {
  if (!url || !/^https?:\/\//.test(url) || /\/\.\.\.|\.\.\.jpg/.test(url)) return null;
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.startsWith('image/')) return 'image';
      if (ct.startsWith('video/')) return 'video';
    }
  } catch { /* падаем в эвристику по расширению ниже */ }
  const path = url.split(/[?#]/)[0].toLowerCase();
  if (/\.(jpe?g|png|webp|gif|avif|bmp|svg)$/.test(path)) return 'image';
  if (/\.(mp4|webm|mov|m4v)$/.test(path)) return 'video';
  return null;
}

async function main() {
  console.log(`→ Тяну «${SHEET_NAME}» из таблицы…`);
  const res = await fetch(csvUrl, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    throw new Error(
      `Не удалось скачать CSV (HTTP ${res.status}). ` +
      `Проверь, что таблица открыта «всем, у кого есть ссылка».`
    );
  }
  const rows = parseCsv(await res.text());
  // Колонки читаем ПО НАЗВАНИЯМ (порядок столбцов в листе менялся) — по ключевому слову.
  const header = (rows[0] || []).map(h => h.trim().toLowerCase());
  const body = rows.slice(1);
  const col = kw => header.findIndex(h => h.includes(kw));
  const iId = col('id'), iName = col('имя'), iSub = col('текст'), iPhoto = col('фото'),
        iGender = col('пол'), iAge = col('возраст'), iCity = col('город'), iBio = col('о себе');
  const at = (cols, i) => (i >= 0 ? (cols[i] || '').trim() : '');

  const people = [];
  for (const cols of body) {
    let idRaw = at(cols, iId);
    const name = at(cols, iName);
    if (!idRaw || !name) continue; // пропускаем пустые болванки
    idRaw = idRaw.replace(/^vv+z-(\d+)$/i, 'vvz-$1'); // чиним опечатки vvvz-N → vvz-N
    const id = /^\d+$/.test(idRaw) ? Number(idRaw) : idRaw; // числовой или строковый (my_profile, vvz-N)
    const photo = at(cols, iPhoto) || null;
    const media = await detectMedia(photo);
    people.push({
      id,
      name,
      subtitle: at(cols, iSub),       // столбец «текст» — подпись под именем (напр. у рекламы)
      photo: media ? photo : null,
      media,
      gender: at(cols, iGender),
      age: parseAge(at(cols, iAge)),
      city: normCity(at(cols, iCity)),
      bio: at(cols, iBio),
    });
    const flag = media === 'image' ? '🖼' : media === 'video' ? '🎬' : '⚠️';
    console.log(`  ${flag} #${id} ${name}`);
  }

  const json = {
    _readme: {
      'что_это': 'Реестр реальных людей для прототипа. Источник — Google-таблица «люди», лист «Люди».',
      'источник': `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`,
      'как_обновить': 'node scripts/fetch-people.mjs  (перезаписывает people.json и people.js)',
      'как_использовать_в_разметке':
        'Подключите data/people.js + components/people-data.js. Имя — [data-person-name="ID"], ' +
        'аватар (img) — [data-person-avatar="ID"], фон-блюр (div) — [data-person-bg="ID"].',
    },
    people,
  };

  writeFileSync(resolve(ROOT, 'data/people.json'), JSON.stringify(json, null, 2) + '\n');
  writeFileSync(
    resolve(ROOT, 'data/people.js'),
    '/* Сгенерировано scripts/fetch-people.mjs — НЕ редактировать вручную. */\n' +
    'window.DS_PEOPLE_DATA = ' + JSON.stringify(people, null, 2) + ';\n'
  );

  const ok = people.filter(p => p.media).length;
  console.log(`✓ Записано ${people.length} чел. (с медиа: ${ok}) → data/people.json, data/people.js`);
}

main().catch(err => { console.error('✗', err.message); process.exit(1); });
