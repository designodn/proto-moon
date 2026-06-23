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
const SHEET_GID = 123647512;       // лист рейтинга работ (место · автор · фото · классы)

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/* ── people.json: автор в листе — id человека, имя/аватар берём из реестра «Люди» ── */
const PEOPLE = {};
JSON.parse(readFileSync(resolve(ROOT, 'data/people.json'), 'utf8')).people
  .forEach(p => { PEOPLE[String(p.id)] = p; });
const personName = id => PEOPLE[String(id)]?.name || '';
const personPhoto = id => PEOPLE[String(id)]?.photo || '';

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

/** Пропорция фото → класс (16:9 | 1:1 | 3:4 | 9:16; дефолт 1:1). */
function arClass(r) {
  const s = String(r || '').trim();
  if (s === '16:9') return '__ar-16-9';
  if (s === '3:4')  return '__ar-3-4';
  if (s === '9:16') return '__ar-9-16';
  return '__ar-1-1';
}

/** Карточка работы участника. rank — номер (бейдж 1–3), hero — крупная во всю ширину. */
function card(e, rank, hero) {
  const cls = hero ? 'll-mar-card __hero' : 'll-mar-card';
  // Ранг-ярлык показываем только у призовых мест (1–3).
  const rankBadge = rank <= 3 ? `\n              <span class="ll-mar-card__rank __rank-${esc(rank)}">${esc(rank)}</span>` : '';
  return `          <a class="${cls}" href="#">
            <span class="ll-mar-card__media ${arClass(e.ratio)}">
              <img src="${esc(e.photo)}" alt="" loading="lazy">${rankBadge}
            </span>
            <span class="ll-mar-card__footer">
              <span class="avatar __size-20 __type-image"><img src="${esc(e.avatar)}" alt=""></span>
              <span class="ll-mar-card__name ds-body-m">${esc(e.name)}</span>
              <span class="button-inline-wrapper __size-20 __view-secondary ll-mar-card__likes"><button class="button-inline __size-20"><span class="button-inline__content"><img class="ll-icon" src="assets/icons/klass_16_20.svg" width="20" height="20" alt="">${esc(e.likes || 0)}</span></button></span>
            </span>
          </a>`;
}

// Относительная высота карточки по пропорции (ширина колонки = 1):
// высота фото + примерно постоянный футер. Нужна для балансировки колонок.
const TILE_H = { '1:1': 1, '3:4': 4 / 3 };
const FOOTER_H = 0.24;   // ≈ (футер 28 + гэп 16) / ширина колонки ~183

function renderEntries(entries) {
  if (!entries.length) return '';
  const [first, ...rest] = entries;
  const hero = card({ ...first, ratio: first.ratio || '16:9' }, 1, true);

  // Лента (места 2+) — masonry в 2 колонки, только пропорции 1:1 и 3:4 (без «больших»).
  // Для каждой работы:
  //   • колонка — принудительная (поле col) либо текущая более короткая (баланс высот);
  //   • пропорция — из данных (если 1:1/3:4) либо чередование с предыдущей в колонке,
  //     чтобы 1:1 и 3:4 не шли подряд.
  const cols = [
    { html: [], h: 0, last: null },   // A — левая
    { html: [], h: 0, last: null },   // B — правая
  ];
  rest.forEach((e, i) => {
    const forced = String(e.col || '').trim().toLowerCase();
    let ci;
    if (forced === 'left'  || forced === 'a' || forced === '1') ci = 0;
    else if (forced === 'right' || forced === 'b' || forced === '2') ci = 1;
    else ci = cols[0].h <= cols[1].h ? 0 : 1;   // в более короткую

    const c = cols[ci];
    const given = String(e.ratio || '').trim();
    const ratio = (given === '1:1' || given === '3:4') ? given
      : c.last === '3:4' ? '1:1'
      : c.last === '1:1' ? '3:4'
      : (ci === 0 ? '1:1' : '3:4');               // колонки стартуют с разных
                                                   // пропорций — чтобы рядом не
                                                   // стояли одинаковые

    c.html.push(card({ ...e, ratio }, i + 2, false));
    c.h += TILE_H[ratio] + FOOTER_H;
    c.last = ratio;
  });
  return `${hero}
          <div class="ll-mar-masonry">
            <div class="ll-mar-col">
${cols[0].html.join('\n')}
            </div>
            <div class="ll-mar-col">
${cols[1].html.join('\n')}
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
      place: col('место', 'ранг', 'rank'), author: col('автор', 'имя', 'id'),
      photo: col('фото'), likes: col('классы', 'лайки', 'класс'),
    };
    if (I.photo < 0 || I.author < 0)
      throw new Error(`лист «${SHEET_NAME}» без колонок «автор»/«фото»: ${head.join(' | ')}. Лента НЕ тронута.`);
    const cell = (c, i) => (i >= 0 ? (c[i] || '').trim() : '');
    entries = [];
    for (const c of body) {
      const authorId = cell(c, I.author);
      const photo = cell(c, I.photo);
      if (!authorId || !/^https?:\/\//.test(photo)) continue;
      const name = personName(authorId);
      if (!name) console.warn(`  ⚠️  автор «${authorId}» не найден в people.json — имя/аватар пустые.`);
      const place = parseInt(cell(c, I.place), 10);
      entries.push({
        place: Number.isFinite(place) ? place : null, authorId,
        name, avatar: personPhoto(authorId),
        photo, likes: cell(c, I.likes),
      });
    }
    // «место» из листа = ранг: сортируем по нему (если колонка заполнена),
    // иначе сохраняем порядок строк.
    if (entries.some(e => e.place != null))
      entries.sort((a, b) => (a.place ?? 1e9) - (b.place ?? 1e9));
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
