#!/usr/bin/env node
/**
 * fetch-gifts.mjs — собирает каталог подарков из Google-таблицы (лист
 * «Подарки», gid 1382684946) в data/gifts.json + data/gifts.js.
 *
 * Лист: первая колонка «тип» (basic | friendversary | …), далее «подарок 1..N»
 * со ссылками на картинки. Тип определяет, на какой странице показывать набор:
 *   - basic         — базовая страница подарков (открыта напрямую);
 *   - friendversary — приход с годовщины дружбы (gifts-catalog.html?to=…).
 *
 * Результат — объект { [тип]: [{ id, image, price }] }. Цены в листе нет →
 * по умолчанию «0 ОК». id = `<тип>-<N>` (для send-gift.html?gift=<id>).
 *
 *   node scripts/fetch-gifts.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createMediaCache } from './lib/media-cache.mjs';

const CHECK_ONLY = process.argv.includes('--check');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHEET = '1Ctwjp2J0HSmvb6kL4NoDqaB9W4QfdAXXDnzyBDLYZ7Y';
const GID = '1382684946';
const URL = `https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq?tqx=out:csv&gid=${GID}`;

// Минимальный CSV-парсер (кавычки + экранированные кавычки внутри полей).
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

console.log('→ Тяну «Подарки» из таблицы…');
const res = await fetch(URL);
if (!res.ok) { console.error('Не удалось получить лист:', res.status); process.exit(1); }
const rows = parseCSV(await res.text());
const header = rows.shift(); // тип, подарок 1..N

const sets = {};
for (const r of rows) {
  const type = (r[0] || '').trim();
  if (!type) continue;
  const images = r.slice(1).map(s => s.trim()).filter(Boolean);
  sets[type] = images.map((image, i) => ({ id: `${type}-${i + 1}`, image, price: '0 ОК' }));
}

// Кэшируем картинки подарков локально (gifts.js грузится в gifts-catalog.html,
// корень) — внешние ссылки/гифки протухают, копия (с тем же типом) остаётся.
const cache = createMediaCache({
  root: ROOT, dirRel: 'assets/gifts',
  manifestPath: resolve(ROOT, 'data/gifts-media.json'), dryRun: CHECK_ONLY,
});
for (const list of Object.values(sets))
  for (const g of list) g.image = await cache.resolveUrl(g.image);
cache.save();
console.log('  ' + cache.report());

if (CHECK_ONLY) {
  console.log('(--check) Ссылки проверены, ничего не записано.');
  process.exit(0);
}

writeFileSync(resolve(ROOT, 'data/gifts.json'), JSON.stringify(sets, null, 2) + '\n');
writeFileSync(resolve(ROOT, 'data/gifts.js'),
  '/**\n' +
  ' * Каталог подарков — зеркало data/gifts.json для браузера\n' +
  ' * (window.DS_GIFTS_DATA). Собрано scripts/fetch-gifts.mjs из листа «Подарки».\n' +
  ' * Структура: { [тип]: [{ id, image, price }] }. Типы: basic (базовая\n' +
  ' * страница), friendversary (приход с годовщины). Не редактировать вручную —\n' +
  ' * правь таблицу и перегоняй скриптом.\n' +
  ' */\n' +
  'window.DS_GIFTS_DATA = ' + JSON.stringify(sets, null, 2) + ';\n');

console.log(`✓ ${Object.keys(sets).length} набора(ов) → data/gifts.json + data/gifts.js`);
Object.entries(sets).forEach(([t, list]) => console.log(`  • ${t}: ${list.length} подарков`));
