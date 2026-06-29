#!/usr/bin/env node
/**
 * fetch-people.mjs — выкачивает лист «Люди» из Google-таблицы в data/people.json + data/people.js
 *
 *   node scripts/fetch-people.mjs            # собрать + скачать фото в assets/people/
 *   node scripts/fetch-people.mjs --check    # только проверить ссылки (ничего не качать/писать)
 *
 * Требование: таблица должна быть открыта «всем, у кого есть ссылка» (просмотр).
 * Источник: https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit
 *
 * Фото НЕ хотлинкаются, а скачиваются локально в assets/people/<id>.<ext>, потому что
 * исходные ссылки (okcdn.ru, gstatic и пр.) со временем протухают. В data/people-media.json
 * хранится манифест (id → исходный URL + хэш картинки), по нему скрипт на каждом прогоне
 * понимает, что изменилось:
 *   🖼  без изменений         — URL и картинка те же
 *   🔁 заменено               — в таблице другой URL
 *   ♻️  обновлено              — URL тот же, но картинка по нему изменилась
 *   ⚠️  протухло               — исходник умер (403/не-картинка); оставляем последнюю копию
 *   🆕 новое                  — фото скачано впервые
 *
 * В people.json/.js поле photo указывает на локальный путь (assets/people/<id>.<ext>);
 * components/people-data.js резолвит его относительно своего расположения.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createSyncGate } from './lib/sheet-cache.mjs';
import { compressImage } from './lib/media-cache.mjs';

const SPREADSHEET_ID = '1Ctwjp2J0HSmvb6kL4NoDqaB9W4QfdAXXDnzyBDLYZ7Y';
const SHEET_NAME = 'Люди';
const CHECK_ONLY = process.argv.includes('--check');
const FORCE = process.argv.includes('--force');   // пересобрать, даже если лист не менялся

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MEDIA_DIR = resolve(ROOT, 'assets/people');
const MEDIA_DIR_REL = 'assets/people';            // как пишем в people.json (от корня репо)
const MANIFEST_PATH = resolve(ROOT, 'data/people-media.json');

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

/** Имя: если перед «(» (девичья фамилия) нет пробела — добавляем его. */
function normName(raw) {
  return String(raw || '').trim().replace(/\s*\(/g, ' (');
}

/** Город: "нет"/пусто → "", иначе с заглавной буквы */
function normCity(raw) {
  const s = String(raw || '').trim();
  if (!s || s.toLowerCase() === 'нет') return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Безопасное имя файла из id (1, vvz-3, my_profile). */
function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
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

function mediaKind(contentType, url) {
  const ct = (contentType || '').toLowerCase();
  if (ct.startsWith('image/')) return 'image';
  if (ct.startsWith('video/')) return 'video';
  const path = (url || '').split(/[?#]/)[0].toLowerCase();
  if (/\.(jpe?g|png|webp|gif|avif|bmp|svg)$/.test(path)) return 'image';
  if (/\.(mp4|webm|mov|m4v)$/.test(path)) return 'video';
  return null;
}

/** Скачивает байты по URL. → { ok, kind, ext, hash, bytes } | { ok:false } */
async function download(url) {
  if (!url || !/^https?:\/\//.test(url) || /\/\.\.\.|\.\.\.jpg/.test(url)) return { ok: false };
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(20000) });
    if (!res.ok) return { ok: false };
    const ct = res.headers.get('content-type') || '';
    const kind = mediaKind(ct, url);
    if (!kind) return { ok: false };
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length) return { ok: false };
    return { ok: true, kind, ext: extFor(ct, url), hash: createHash('sha256').update(bytes).digest('hex'), bytes };
  } catch {
    return { ok: false };
  }
}

/** Удаляет старые файлы assets/people/<id>.* (на случай смены расширения). */
function cleanupFor(id, keepFile) {
  const prefix = safeId(id) + '.';
  for (const f of readdirSync(MEDIA_DIR)) {
    if (f.startsWith(prefix) && f !== keepFile) {
      try { unlinkSync(resolve(MEDIA_DIR, f)); } catch { /* ignore */ }
    }
  }
}

function loadManifest() {
  try { return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')); }
  catch { return {}; }
}

async function main() {
  console.log(`→ Тяну «${SHEET_NAME}» из таблицы…${CHECK_ONLY ? ' (--check, без записи)' : ''}`);
  const res = await fetch(csvUrl, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    throw new Error(
      `Не удалось скачать CSV (HTTP ${res.status}). ` +
      `Проверь, что таблица открыта «всем, у кого есть ссылка».`
    );
  }
  const csvText = await res.text();
  const gate = createSyncGate({ root: ROOT, key: 'people',
    codeDeps: [fileURLToPath(import.meta.url), resolve(__dirname, 'lib/media-cache.mjs')] });
  if (gate.unchanged(csvText) && !FORCE && !CHECK_ONLY) {
    console.log(`✓ «${SHEET_NAME}» без изменений — пропускаю (--force чтобы пересобрать).`);
    return;
  }
  const rows = parseCsv(csvText);
  // Колонки читаем ПО НАЗВАНИЯМ (порядок столбцов в листе менялся) — по ключевому слову.
  const header = (rows[0] || []).map(h => h.trim().toLowerCase());
  const body = rows.slice(1);
  const col = kw => header.findIndex(h => h.includes(kw));
  const iId = col('id'), iName = col('имя'), iSub = col('текст'), iPhoto = col('фото'),
        iGender = col('пол'), iAge = col('возраст'), iCity = col('город'), iBio = col('о себе'),
        iVerified = col('верифи');   // колонка «Верификация» (да → бейдж верификации)
  const at = (cols, i) => (i >= 0 ? (cols[i] || '').trim() : '');

  if (!CHECK_ONLY) mkdirSync(MEDIA_DIR, { recursive: true });
  const manifest = loadManifest();
  const nextManifest = {};
  const stats = { same: 0, replaced: 0, changed: 0, stale: 0, fresh: 0, none: 0 };
  const now = new Date().toISOString();

  const people = [];
  for (const cols of body) {
    let idRaw = at(cols, iId);
    const name = normName(at(cols, iName));
    if (!idRaw || !name) continue; // пропускаем пустые болванки
    idRaw = idRaw.replace(/^vv+z-(\d+)$/i, 'vvz-$1'); // чиним опечатки vvvz-N → vvz-N
    const id = /^\d+$/.test(idRaw) ? Number(idRaw) : idRaw; // числовой или строковый (my_profile, vvz-N)
    const key = String(id);
    const srcUrl = at(cols, iPhoto) || null;
    const prev = manifest[key] || null;

    let photo = null, media = null, flag = '⚠️', note = '';

    if (!srcUrl) {
      flag = '·'; note = 'нет ссылки'; stats.none++;
    } else {
      const dl = await download(srcUrl);
      if (dl.ok && dl.kind === 'image') {
        // hash оставляем по исходнику (детект изменения), на диск — сжатую версию.
        const c = await compressImage(dl.bytes, dl.ext);
        if (c) { dl.bytes = c.bytes; dl.ext = c.ext; }
      }
      if (dl.ok) {
        const file = `${safeId(id)}.${dl.ext}`;
        media = dl.kind;
        photo = `${MEDIA_DIR_REL}/${file}`;
        // классификация изменения
        if (!prev) { flag = '🆕'; note = 'новое'; stats.fresh++; }
        else if (prev.src !== srcUrl) { flag = '🔁'; note = 'заменено'; stats.replaced++; }
        else if (prev.hash !== dl.hash) { flag = '♻️'; note = 'обновлено'; stats.changed++; }
        else { flag = '🖼'; note = ''; stats.same++; }

        if (!CHECK_ONLY) {
          writeFileSync(resolve(MEDIA_DIR, file), dl.bytes);
          cleanupFor(id, file);
        }
        nextManifest[key] = { src: srcUrl, file, type: media, hash: dl.hash, status: 'ok', checkedAt: now };
      } else if (prev && prev.file && existsSync(resolve(MEDIA_DIR, prev.file))) {
        // исходник умер, но локальная копия есть — сохраняем её, помечаем как протухший
        // источник. Заодно дожимаем старые png/jpg-копии в webp (храним только webp).
        flag = '⚠️'; stats.stale++;
        let file = prev.file;
        const m = /\.(png|jpe?g)$/i.exec(file);
        if (m && !CHECK_ONLY) {
          const c = await compressImage(readFileSync(resolve(MEDIA_DIR, file)), m[1].toLowerCase());
          if (c) { file = `${safeId(id)}.${c.ext}`; writeFileSync(resolve(MEDIA_DIR, file), c.bytes); cleanupFor(id, file); }
        }
        note = `протухло (источник умер; оставлена копия ${file})`;
        media = prev.type; photo = `${MEDIA_DIR_REL}/${file}`;
        nextManifest[key] = { ...prev, file, src: srcUrl, status: 'stale', checkedAt: now };
      } else {
        flag = '⚠️'; note = 'битая ссылка (копии нет)'; stats.none++;
        nextManifest[key] = { src: srcUrl, file: null, type: null, hash: null, status: 'dead', checkedAt: now };
      }
    }

    // «Верификация» = да → бейдж верификации рядом с именем (см. people-data.js).
    const verified = /^(да|yes|true|1|✓|✔)$/.test(at(cols, iVerified).toLowerCase());
    people.push({
      id,
      name,
      subtitle: at(cols, iSub),       // столбец «текст» — подпись под именем (напр. у рекламы)
      photo,
      media,
      gender: at(cols, iGender),
      age: parseAge(at(cols, iAge)),
      city: normCity(at(cols, iCity)),
      bio: at(cols, iBio),
      ...(verified ? { verified: true } : {}),
    });
    console.log(`  ${flag} #${id} ${name}${note ? ' — ' + note : ''}`);
  }

  // ── Платформенные аккаунты (нет в листе «Люди»): фиксированные системные
  //    авторы вроде самого сервиса ОК. Спека в коде, фото кешируется как у всех.
  //    Сейчас один — `odkl` («Одноклассники», verified): автор сервисных постов
  //    (напр. карточка-годовщина дружбы как репост от сервиса). ───────────────
  const EXTRA_PEOPLE = [
    { id: 'odkl', name: 'Одноклассники', verified: true,
      photoUrl: 'https://cloud.pllsll.ru/1366x/pollskill/storage/91/5d/d/0b14881df81.png' },
  ];
  for (const ex of EXTRA_PEOPLE) {
    const key = String(ex.id);
    const prev = manifest[key] || null;
    let photo = null, media = null, flag = '⚠️', note = '';
    const dl = await download(ex.photoUrl);
    if (dl.ok && dl.kind === 'image') {
      const c = await compressImage(dl.bytes, dl.ext);
      if (c) { dl.bytes = c.bytes; dl.ext = c.ext; }
    }
    if (dl.ok) {
      const file = `${safeId(ex.id)}.${dl.ext}`;
      media = dl.kind; photo = `${MEDIA_DIR_REL}/${file}`;
      if (!prev) { flag = '🆕'; note = 'новое'; stats.fresh++; }
      else if (prev.src !== ex.photoUrl) { flag = '🔁'; note = 'заменено'; stats.replaced++; }
      else if (prev.hash !== dl.hash) { flag = '♻️'; note = 'обновлено'; stats.changed++; }
      else { flag = '🖼'; note = ''; stats.same++; }
      if (!CHECK_ONLY) { writeFileSync(resolve(MEDIA_DIR, file), dl.bytes); cleanupFor(ex.id, file); }
      nextManifest[key] = { src: ex.photoUrl, file, type: media, hash: dl.hash, status: 'ok', checkedAt: now };
    } else if (prev && prev.file && existsSync(resolve(MEDIA_DIR, prev.file))) {
      flag = '⚠️'; stats.stale++;
      const file = prev.file;
      note = `протухло (источник умер; оставлена копия ${file})`;
      media = prev.type; photo = `${MEDIA_DIR_REL}/${file}`;
      nextManifest[key] = { ...prev, file, src: ex.photoUrl, status: 'stale', checkedAt: now };
    } else {
      flag = '⚠️'; note = 'битая ссылка (копии нет)'; stats.none++;
    }
    people.push({ id: ex.id, name: ex.name, subtitle: '', photo, media,
      gender: '', age: null, city: '', bio: '', ...(ex.verified ? { verified: true } : {}) });
    console.log(`  ${flag} #${ex.id} ${ex.name}${note ? ' — ' + note : ''}`);
  }

  console.log(
    `\nИтого: 🖼 ${stats.same} без изм · 🆕 ${stats.fresh} новых · 🔁 ${stats.replaced} заменено · ` +
    `♻️ ${stats.changed} обновлено · ⚠️ ${stats.stale} протухло · ✗ ${stats.none} без фото`
  );

  if (CHECK_ONLY) {
    console.log('\n(--check) Ничего не записано. Прогони без флага, чтобы скачать/обновить.');
    return;
  }

  const json = {
    _readme: {
      'что_это': 'Реестр реальных людей для прототипа. Источник — Google-таблица «люди», лист «Люди».',
      'источник': `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`,
      'как_обновить': 'node scripts/fetch-people.mjs  (скачивает фото в assets/people/, перезаписывает people.json/.js)',
      'проверить_ссылки': 'node scripts/fetch-people.mjs --check  (показывает протухшие/заменённые, ничего не пишет)',
      'фото': 'photo указывает на локальную копию assets/people/<id>.<ext>; манифест источников — data/people-media.json',
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
  writeFileSync(MANIFEST_PATH, JSON.stringify(nextManifest, null, 2) + '\n');

  gate.commit();
  const ok = people.filter(p => p.media).length;
  console.log(`✓ Записано ${people.length} чел. (с медиа: ${ok}) → data/people.json, data/people.js, data/people-media.json`);
}

main().catch(err => { console.error('✗', err.message); process.exit(1); });
