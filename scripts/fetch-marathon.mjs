#!/usr/bin/env node
/**
 * fetch-marathon.mjs — собирает ленту работ фотомарафона (marathon.html) из листа
 * «Марафон» Google-таблицы.
 *
 *   node scripts/fetch-marathon.mjs            — тянет лист и перегенерит ленту
 *   node scripts/fetch-marathon.mjs --offline  — реген из data/marathon.json (без сети)
 *
 * Что делает (по образцу scripts/fetch-q3.mjs):
 *   1. тянет лист «Марафон» (gviz CSV) → массив работ участников;
 *   2. пишет data/marathon.json (запись «как есть» из таблицы);
 *   3. рендерит карточки (hero + masonry) в разметку marathon.html;
 *   4. вставляет их между <!-- FEED:START/END -->.
 *
 * Ранг = порядок строк (1, 2, 3 …). Первая работа → крупная hero-карточка,
 * остальные → masonry в 2 колонки.
 *
 * ⚠️  SHEET_GID — заглушка: проставь реальный gid листа «Марафон», когда он
 *     будет готов. До этого пользуйся офлайн-регеном (--offline) из demo-данных.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SPREADSHEET_ID = '1Ctwjp2J0HSmvb6kL4NoDqaB9W4QfdAXXDnzyBDLYZ7Y';
const SHEET_NAME = 'Марафон';
const SHEET_GID = null;            // TODO: gid листа «Марафон» (см. шапку файла)

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const csvUrl = SHEET_GID == null ? null :
  `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
  `?tqx=out:csv&gid=${SHEET_GID}&headers=1`;

/* ── CSV ──────────────────────────────────────────────────────────────────── */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ── helpers разметки ───────────────────────────────────────────────────────── */
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Карточка работы участника. rank — номер (бейдж), hero — крупная во всю ширину. */
function card(e, rank, hero) {
  const cls = hero ? 'll-mar-card __hero' : 'll-mar-card';
  return `          <a class="${cls}" href="#">
            <span class="ll-mar-card__media">
              <img src="${esc(e.photo)}" alt="" loading="lazy">
              <span class="ll-mar-card__rank">${esc(rank)}</span>
            </span>
            <span class="ll-mar-card__footer">
              <span class="avatar __size-20 __type-image"><img src="${esc(e.avatar)}" alt=""></span>
              <span class="ll-mar-card__name ds-body-m">${esc(e.name)}</span>
              <span class="ll-mar-card__likes ds-body-m"><img class="ll-icon" src="assets/icons/klass_16_20.svg" width="20" height="20" alt="">${esc(e.likes || 0)}</span>
            </span>
          </a>`;
}

function renderEntries(entries) {
  if (!entries.length) return '';
  const [first, ...rest] = entries;
  const hero = card(first, 1, true);
  // Раскладываем работы по двум колонкам ПОСТРОЧНО (через одну), чтобы порядок
  // мест шёл слева-направо сверху-вниз: верхний ряд — места 2 и 3, ниже 4 и 5 и т.д.
  const colA = [], colB = [];
  rest.forEach((e, i) => (i % 2 === 0 ? colA : colB).push(card(e, i + 2, false)));
  return `${hero}
          <div class="ll-mar-masonry">
            <div class="ll-mar-col">
${colA.join('\n')}
            </div>
            <div class="ll-mar-col">
${colB.join('\n')}
            </div>
          </div>`;
}

/* ── splice в marathon.html ─────────────────────────────────────────────────── */
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function splice(cardsHtml) {
  const file = resolve(ROOT, 'marathon.html');
  let html = readFileSync(file, 'utf8');
  const START = '<!-- FEED:START (генерится scripts/fetch-marathon.mjs — не редактировать вручную) -->';
  const END = '<!-- FEED:END -->';
  const block = `${START}\n${cardsHtml}\n        ${END}`;
  if (!html.includes(START))
    throw new Error('Не нашёл маркер FEED:START в marathon.html');
  html = html.replace(new RegExp(escRe(START) + '[\\s\\S]*?' + escRe(END)), block);
  writeFileSync(file, html);
}

/* ── main ───────────────────────────────────────────────────────────────────── */
async function main() {
  const offline = process.argv.includes('--offline') || csvUrl == null;
  let data, entries;

  if (offline) {
    if (csvUrl == null && !process.argv.includes('--offline'))
      console.log('→ SHEET_GID не задан — работаю офлайн из data/marathon.json.');
    else console.log('→ Офлайн-реген из data/marathon.json (таблицу не тяну)…');
    data = JSON.parse(readFileSync(resolve(ROOT, 'data/marathon.json'), 'utf8'));
    entries = data.entries || [];
  } else {
    console.log(`→ Тяну «${SHEET_NAME}» из таблицы…`);
    const res = await fetch(csvUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} — проверь доступ к таблице по ссылке.`);
    const rows = parseCsv(await res.text());
    const [header = [], ...body] = rows;
    const head = header.map(h => String(h || '').trim().toLowerCase());
    const col = (...names) => {
      for (const n of names) {
        const i = head.findIndex(h => h === n || h.startsWith(n + ' '));
        if (i >= 0) return i;
      }
      return -1;
    };
    const I = {
      id: col('id'), name: col('имя', 'автор'), avatar: col('аватар', 'ава'),
      photo: col('фото'), likes: col('лайки', 'класс'),
    };
    if (I.photo < 0)
      throw new Error(`лист «${SHEET_NAME}» без колонки «фото»: ${head.join(' | ')}. Лента НЕ тронута.`);
    const cell = (c, i) => (i >= 0 ? (c[i] || '').trim() : '');
    entries = [];
    for (const c of body) {
      const id = cell(c, I.id);
      const photo = cell(c, I.photo);
      if (!id || !/^https?:\/\//.test(photo)) continue;
      entries.push({
        id, name: cell(c, I.name), avatar: cell(c, I.avatar),
        photo, likes: cell(c, I.likes),
      });
    }
    // мету (шапку) сохраняем из существующего json — её в листе работ нет.
    const prev = JSON.parse(readFileSync(resolve(ROOT, 'data/marathon.json'), 'utf8'));
    data = { _readme: prev._readme, meta: prev.meta, entries };
    writeFileSync(resolve(ROOT, 'data/marathon.json'), JSON.stringify(data, null, 2) + '\n');
  }

  if (entries.length === 0)
    throw new Error('ни одной работы — лента НЕ тронута (проверь лист).');
  splice(renderEntries(entries));
  console.log(`✓ ${entries.length} работ → вставлено в marathon.html`);
}

main().catch(err => { console.error('✗', err.message); process.exit(1); });
