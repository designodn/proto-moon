#!/usr/bin/env node
/**
 * fetch-activity.mjs — собирает «Вокруг вас» из листа «Активности» Google-таблицы.
 *
 *   node scripts/fetch-activity.mjs
 *
 * Что делает:
 *   1. тянет лист «Активности» (gviz CSV) → массив активностей (колонки по НАЗВАНИЯМ);
 *   2. пишет data/activity.json (запись «как есть»);
 *   3. рендерит activity-ячейки в разметке NV (люди/имена/склонения — из «Люди»);
 *   4. вставляет их и в виджет ленты (new-vision/lenta.html, #activityConveyor),
 *      и в страницу new-vision/okruzhenie.html (#activityList) — между маркерами.
 *
 * Контракт листа «Активности» (заголовки колонок, порядок любой):
 *   id · лид · кто · изображение · бейдж · текст · кнопка · категория
 *
 *   лид:        person | discussion | section | photo | photo-pair
 *   кто:        person → id из «Люди»; discussion → 2–3 id через запятую;
 *               section → эмодзи (фолбэк, если нет «изображение»)
 *   изображение: section → фото сообщества (круглый аватар); photo → URL (сквиркл);
 *               photo-pair → 2 URL через запятую
 *   бейдж:      «онлайн» → зелёная точка на аватаре (иначе пусто)
 *   текст:      для person — БЕЗ имени (имя добавляется само, жирным, из «Люди»);
 *               род глагола — токен {муж/жен}, напр. выиграл{/а}; иконка билета — {билет};
 *               для прочих — свободный текст, **жирным** выделяешь сам
 *   кнопка:     подпись кнопки
 *   категория:  win | neuro | holiday | пусто  (анимация подложки на входе)
 *
 * Требование: таблица открыта «всем, у кого есть ссылка».
 * Для офлайн-теста: ACTIVITY_CSV_FILE=/path/to.csv node scripts/fetch-activity.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SPREADSHEET_ID = '1Ctwjp2J0HSmvb6kL4NoDqaB9W4QfdAXXDnzyBDLYZ7Y';
const SHEET_NAME = 'Вокруг нас';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const csvUrl =
  `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
  `?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;

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

/* ── people.json ────────────────────────────────────────────────────────────── */
const peopleRaw = JSON.parse(readFileSync(resolve(ROOT, 'data/people.json'), 'utf8')).people;
const PEOPLE = {};
peopleRaw.forEach(p => { PEOPLE[String(p.id)] = p; });
const nameOf = id => (PEOPLE[String(id)]?.name || '').replace(/\s*\(.*$/, '').trim();
const genderOf = id => (PEOPLE[String(id)]?.gender || '').trim();

/* ── helpers ──────────────────────────────────────────────────────────────── */
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const TICKET = '<img class="inline-ticket" src="../assets/koleso/biletik.png" alt="билет">';

/** Подставляет иконки/род и **жирный**. gender — 'м'|'ж'|'' (для токена {муж/жен}). */
function renderText(raw, gender) {
  let t = esc(raw);
  t = t.replace(/\{([^}]*)\}/g, (_, body) => {
    if (body === 'билет') return TICKET;
    if (body.includes('/')) { const [m, f] = body.split('/'); return gender === 'ж' ? (f ?? '') : (m ?? ''); }
    return body;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  return t;
}

const avatarImg = (id, size) => `<div class="avatar __size-${size} __type-image"><img data-person-avatar="${esc(id)}" alt=""></div>`;
const avatarOnline = id => `<div class="avatar __size-44 __type-image __has-addon">
                  <img data-person-avatar="${esc(id)}" alt="">
                  <span class="avatar__addon __pos-bl"><span class="status-dot"></span></span>
                </div>`;

function leadFor(a) {
  switch (a.lead) {
    case 'person':
      return a.online ? avatarOnline(a.who) : avatarImg(a.who, 44);
    case 'discussion': {
      const ids = a.who.split(',').map(s => s.trim()).filter(Boolean);
      return `<div class="ava-cluster">
                ${ids.map(id => avatarImg(id, 24)).join('\n                ')}
              </div>`;
    }
    case 'section':
      return a.image
        ? `<div class="avatar __size-44 __type-image"><img src="${esc(a.image)}" alt=""></div>`
        : `<div class="avatar __size-44 __type-emoji" style="--avatar-bg: var(--dynamic-surface-tint-indigo);">${esc(a.who || '👥')}</div>`;
    case 'photo':
      return `<div class="picture __size-44 __type-image"><img src="${esc(a.image)}" alt=""></div>`;
    case 'photo-pair': {
      const urls = a.image.split(',').map(s => s.trim()).filter(Boolean).slice(0, 2);
      return `<div class="photo-pair">
                ${urls.map(u => `<div class="picture __type-image"><img src="${esc(u)}" alt=""></div>`).join('\n                ')}
              </div>`;
    }
    default: return avatarImg(a.who, 44);
  }
}

const CONFETTI = `        <span class="confetti" aria-hidden="true">
          <i style="--tx:-16px;--ty:-14px;background:#ff4d4d"></i>
          <i style="--tx:-2px;--ty:-22px;background:#ffb02e"></i>
          <i style="--tx:16px;--ty:-14px;background:#3ec46d"></i>
          <i style="--tx:22px;--ty:-2px;background:#4d8dff"></i>
          <i style="--tx:16px;--ty:14px;background:#b05cff"></i>
          <i style="--tx:0px;--ty:20px;background:#ff5ca8"></i>
          <i style="--tx:-16px;--ty:14px;background:#ffd23e"></i>
          <i style="--tx:-22px;--ty:0px;background:#2ec4b6"></i>
        </span>`;

/** Рендер одной activity-ячейки. */
function renderCell(a) {
  const catClass = a.category ? ` __cat-${a.category}` : '';
  let text;
  if (a.lead === 'person') {
    const name = nameOf(a.who);
    text = `<b>${esc(name)}</b> ${renderText(a.text, genderOf(a.who))}`;
  } else {
    text = renderText(a.text, '');
  }
  const confetti = a.category === 'holiday' ? '\n' + CONFETTI : '';
  return `        <div class="uni-cell-wrapper __type-activity${catClass}">
          <div class="uni-cell-container __state-enabled">
            <div class="uni-cell">
              ${leadFor(a)}
              <div class="uni-cell-additional-content ds-body-m">${text}</div>
              <div class="button-wrapper __size-36"><button class="button-container __style-secondary"><span class="button-content">${esc(a.button)}</span></button></div>
            </div>
          </div>${confetti}
        </div>`;
}

/* ── splice ───────────────────────────────────────────────────────────────── */
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function spliceFile(file, startMark, endMark, content, firstStartAnchor, firstEndAnchor) {
  let html = readFileSync(file, 'utf8');
  const block = `${startMark}\n${content}\n        ${endMark}`;
  if (html.includes(startMark)) {
    html = html.replace(new RegExp(escRe(startMark) + '[\\s\\S]*?' + escRe(endMark)), block);
  } else {
    const s = html.indexOf(firstStartAnchor);
    const e = html.indexOf(firstEndAnchor);
    if (s === -1 || e === -1) throw new Error(`Не нашёл границы вставки в ${file}`);
    html = html.slice(0, s) + block + html.slice(e);
  }
  writeFileSync(file, html);
}

/* ── main ─────────────────────────────────────────────────────────────────── */
async function getCsv() {
  if (process.env.ACTIVITY_CSV_FILE) return readFileSync(process.env.ACTIVITY_CSV_FILE, 'utf8');
  const res = await fetch(csvUrl, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} — проверь доступ к таблице и имя листа «${SHEET_NAME}».`);
  return res.text();
}

// Колонки ищем ПО КЛЮЧЕВОМУ СЛОВУ (заголовки в листе бывают с уточнениями,
// напр. «изображение (если есть)»; id может отсутствовать — тогда генерим).
function colIndex(header) {
  const norm = header.map(h => h.trim().toLowerCase());
  const find = kw => norm.findIndex(h => h.includes(kw));
  const idx = {
    id: find('id'), lead: find('лид'), who: find('кто'), image: find('изображ'),
    badge: find('бейдж'), text: find('текст'), button: find('кнопк'), category: find('категори'),
  };
  if (idx.lead < 0)
    throw new Error(`В листе «${SHEET_NAME}» нет колонки «лид». Это точно лист активностей?`);
  return idx;
}

async function main() {
  console.log(`→ Тяну «${SHEET_NAME}»…`);
  const rows = parseCsv(await getCsv());
  const [header, ...body] = rows;
  const idx = colIndex(header);
  const at = (r, i) => (i >= 0 ? (r[i] || '').trim() : '');

  const acts = [];
  let n = 0;
  for (const r of body) {
    const lead = at(r, idx.lead);
    if (!lead) continue;            // пустой/мусорный ряд
    n++;
    let category = at(r, idx.category).toLowerCase();
    if (category === 'пусто') category = '';   // в листе пусто помечают словом «пусто»
    acts.push({
      id: at(r, idx.id) || `a${n}`,
      lead,
      who: at(r, idx.who),
      image: at(r, idx.image),
      online: at(r, idx.badge).toLowerCase() === 'онлайн',
      text: at(r, idx.text),
      button: at(r, idx.button),
      category,
    });
  }

  writeFileSync(resolve(ROOT, 'data/activity.json'),
    JSON.stringify({ _readme: { 'источник': `Google-таблица, лист «${SHEET_NAME}»`, 'как_обновить': 'node scripts/fetch-activity.mjs (или скилл fetch-activity)' }, activities: acts }, null, 2) + '\n');

  const cells = acts.map(renderCell).join('\n');
  // Вариант для страниц с <base href="../"> (activity-lenta/): ассеты резолвятся
  // от корня, поэтому БЕЗ «../» (иначе ушли бы выше корня). В new-vision/* base
  // нет → там нужен «../» (cells как есть).
  const cellsBase = cells.replace(/\.\.\/assets\//g, 'assets/');

  // Страница «Вокруг вас» — список #activityList (после промо-баннера, до закрытия списка)
  spliceFile(
    resolve(ROOT, 'new-vision/okruzhenie.html'),
    '<!-- ACTIVITY:START (генерится scripts/fetch-activity.mjs — не редактировать) -->',
    '<!-- ACTIVITY:END -->',
    cells,
    '<!-- Спец-ячейка к промо',
    '\n      </div>\n\n    </div>\n\n    <ok-tabbar',
  );

  // Виджет в ленте — конвейер #activityConveyor (внутри __track)
  spliceFile(
    resolve(ROOT, 'new-vision/lenta.html'),
    '<!-- ACTIVITY-WIDGET:START (генерится scripts/fetch-activity.mjs — не редактировать) -->',
    '<!-- ACTIVITY-WIDGET:END -->',
    cells,
    '          <div class="uni-cell-wrapper __type-activity __cat-win">',
    '\n          </div>\n        </div>\n      </div>',
  );

  // Виджет в ленте activity-lenta (q3-стиль, <base href="../">) — конвейер
  // #activityConveyor. Те же ячейки, но пути без «../» (см. cellsBase). Маркеры
  // уже стоят в файле; вставка строго между ними.
  spliceFile(
    resolve(ROOT, 'activity-lenta/lenta.html'),
    '<!-- ACTIVITY-WIDGET:START (генерится scripts/fetch-activity.mjs — не редактировать) -->',
    '<!-- ACTIVITY-WIDGET:END -->',
    cellsBase,
    '          <div class="uni-cell-wrapper __type-activity __cat-win">',
    '\n          </div>\n        </div>\n      </div>',
  );

  // Страница «Вокруг вас» в activity-lenta (q3-стиль, <base href="../">) — список
  // #activityList. Те же ячейки, пути без «../» (cellsBase). Маркеры уже в файле.
  spliceFile(
    resolve(ROOT, 'activity-lenta/okruzhenie.html'),
    '<!-- ACTIVITY:START (генерится scripts/fetch-activity.mjs — не редактировать) -->',
    '<!-- ACTIVITY:END -->',
    cellsBase,
    '<!-- ACTIVITY:START',
    '<!-- ACTIVITY:END -->',
  );

  console.log(`✓ ${acts.length} активностей → data/activity.json + okruzhenie ×2 + nv/lenta + activity-lenta/lenta (виджеты)`);
  acts.forEach(a => console.log(`  • ${a.id.padEnd(4)} ${a.lead}`));
}

main().catch(err => { console.error('✗', err.message); process.exit(1); });
