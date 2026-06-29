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
import { createMediaCache } from './lib/media-cache.mjs';
import { createSyncGate } from './lib/sheet-cache.mjs';

const SPREADSHEET_ID = '1Ctwjp2J0HSmvb6kL4NoDqaB9W4QfdAXXDnzyBDLYZ7Y';
const SHEET_NAME = 'Вокруг нас';
// Тянем по СТАБИЛЬНОМУ gid (как Q3-лента), а не по имени листа: имя могут
// переименовать, и gviz по ненайденному имени молча отдаёт первый лист. gid
// переживает переименования и гарантирует, что читаем именно тот таб, где
// заведены новые ячейки (trans / trans-gallery / clip-gallery).
const SHEET_GID = '502211906';
const FORCE = process.argv.includes('--force');   // пересобрать, даже если лист не менялся

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const csvUrl =
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

/* ── people.json ────────────────────────────────────────────────────────────── */
const peopleRaw = JSON.parse(readFileSync(resolve(ROOT, 'data/people.json'), 'utf8')).people;
const PEOPLE = {};
peopleRaw.forEach(p => { PEOPLE[String(p.id)] = p; });
const nameOf = id => (PEOPLE[String(id)]?.name || '').replace(/\s*\(.*$/, '').trim();
const genderOf = id => (PEOPLE[String(id)]?.gender || '').trim();

/* ── helpers ──────────────────────────────────────────────────────────────── */
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const TICKET = '<img class="inline-ticket" src="../assets/koleso/biletik.png" alt="билет">';

/** Стабильный псевдо-рандом 10–80 из строки-сида: одинаков между прогонами,
 *  чтобы счётчики плиток (зрители/лайки) не «прыгали» в диффе при каждом регене. */
function seededCount(seed) {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 10 + (Math.abs(h) % 71);   // 10..80
}

/** Кнопка-действие справа в ячейке — DS secondary, размер 28 (по макету). */
function cellButton(label) {
  return `<div class="button-wrapper __size-28"><button class="button-container __style-secondary"><span class="button-content">${esc(label)}</span></button></div>`;
}

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

// Кэш кладёт картинки в assets/around-you/… (репо-относительно). На NV-страницах
// ассеты идут через «../», на activity-lenta (<base href="../">) — без «../»
// (это делает pageCellsBase/widgetCellsBase, срезая «../assets/»). Поэтому в рендер отдаём «../»-форму;
// http-ссылки (живой внешний CDN, если файл не скачался) не трогаем.
const pageUrl = (u) => (typeof u === 'string' && u.startsWith('assets/')) ? '../' + u : u;
const pageImages = (s) => s.split(',').map(x => x.trim()).filter(Boolean).map(pageUrl).join(', ');

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

/* ── Новые типы для страницы «Вокруг вас» (по тапу на виджет) ────────────────
   trans-gallery / clip-gallery — портлет: шапка (ава + тайтл + «Все») +
   горизонтальный ряд плиток 120×164 с бейджем. trans — компактная строка с
   live-превью 90×60. Рендерятся ТОЛЬКО на полноэкранной странице okruzhenie —
   в горизонтальный конвейер ленты не попадают (см. widgetCells в main). */

/** Тайтл галереи: ведущая часть — полужирная (ds-title-s 600), хвост — regular.
 *  clip-gallery: «N Клипов из …»; trans-gallery: «В Городе N эфиров».
 *  Поддерживает и ручную разметку **жирным** в тексте листа. */
function galleryTitle(lead, raw) {
  const t = esc(raw);
  if (t.includes('**')) return t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const wrap = (head, tail) => `${head}<span class="au-gallery__title-tail">${tail}</span>`;
  if (lead === 'clip-gallery') {
    const m = t.match(/^(\S+\s+\S+)(.*)$/);          // «12 Клипов» | « из … в топе»
    return m ? wrap(m[1], m[2]) : t;
  }
  const m = t.match(/^(.*?)(\s+\d+\s+\S+)$/);         // «В Санкт-Петербурге» | « 5 эфиров»
  return m ? wrap(m[1], m[2]) : t;
}

/** Бейдж плитки: live (красная пилюля, радио-глиф + зрители) или klass
 *  (тёмная пилюля, палец вверх + лайки). DS-компонент tag + icon. */
function tileBadge(kind, n) {
  return kind === 'live'
    ? `<span class="tag __style-live __size-20 au-tile__badge __pos-tl"><span class="icon __size-16 __slot-music-radio"></span>${n}</span>`
    : `<span class="tag __style-primary __size-20 au-tile__badge __pos-bl"><span class="icon __size-16 __slot-klass-outline"></span>${n}</span>`;
}

/** Галерея эфиров (kind='live') / клипов (kind='clip') — портлет со скроллом плиток. */
function renderGallery(a, kind) {
  const tiles = (a.image || '').split(',').map(s => s.trim()).filter(Boolean);
  const ava = tiles[0] || '';
  const row = tiles.map((u, i) => `              <div class="au-tile">
                <img class="au-tile__img" src="${esc(u)}" alt="" loading="lazy">
                ${tileBadge(kind, seededCount(u + i))}
              </div>`).join('\n');
  return `        <section class="au-gallery">
          <header class="au-gallery__header">
            <div class="picture __size-44 __type-image au-gallery__ava"><img src="${esc(ava)}" alt=""></div>
            <p class="au-gallery__title ds-title-s">${galleryTitle(a.lead, a.text)}</p>
            ${cellButton(a.button || 'Все')}
          </header>
          <div class="au-gallery__row">
${row}
          </div>
        </section>`;
}

/** Компактная ячейка «N в эфире» — live-превью 90×60 + 2 строки + «Смотреть». */
function renderTrans(a) {
  const name = nameOf(a.who);
  const t = renderText(a.text, genderOf(a.who));        // «в эфире 34 смотрят»
  const m = t.match(/^(.*?)(\d.*)$/);                    // делим по первому числу
  const line1 = `<b>${esc(name)}</b> ${m ? m[1].trim() : t}`.trim();
  const line2 = m ? m[2].trim() : '';
  const viewers = (line2.match(/\d+/) || [String(seededCount(a.who + 'trans'))])[0];
  return `        <div class="uni-cell-wrapper __type-activity">
          <div class="uni-cell-container __state-enabled">
            <div class="uni-cell">
              <div class="au-trans">
                <img class="au-trans__bg" data-person-avatar="${esc(a.who)}" alt="">
                <img class="au-trans__img" data-person-avatar="${esc(a.who)}" alt="">
                <span class="tag __style-live __size-20 au-trans__badge"><span class="icon __size-16 __slot-music-radio"></span>${viewers}</span>
              </div>
              <div class="uni-cell-additional-content ds-body-m">${line1}<br><span class="au-trans__sub">${esc(line2)}</span></div>
              ${cellButton(a.button || 'Смотреть')}
            </div>
          </div>
        </div>`;
}

/** Рендер одной activity-ячейки. */
function renderCell(a) {
  if (a.lead === 'trans-gallery') return renderGallery(a, 'live');
  if (a.lead === 'clip-gallery')  return renderGallery(a, 'clip');
  if (a.lead === 'trans')         return renderTrans(a);

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
              ${cellButton(a.button)}
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
  const csvText = await getCsv();
  // people.json в зависимостях: жирное имя в person-ячейках запекается из него →
  // правка листа «Люди» пересобирает и виджет «Вокруг вас».
  const gate = createSyncGate({ root: ROOT, key: 'activity-around',
    codeDeps: [fileURLToPath(import.meta.url), resolve(__dirname, 'lib/media-cache.mjs'),
               resolve(ROOT, 'data/people.json')] });
  if (gate.unchanged(csvText) && !FORCE) {
    console.log(`✓ «${SHEET_NAME}» без изменений — пропускаю (--force чтобы пересобрать).`);
    return;
  }
  const rows = parseCsv(csvText);
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

  // Картинки активностей (section/photo/photo-pair) — в репо: качаем локально
  // (хэш-проверка «изменилось ли», старое чистится при prune). В json кладём
  // репо-относительный путь assets/around-you/… (для рендера добавим «../» ниже).
  const cache = createMediaCache({ root: ROOT, dirRel: 'assets/around-you',
    manifestPath: resolve(ROOT, 'data/around-you-media.json') });
  for (const a of acts) {
    if (!a.image) continue;
    const parts = a.image.split(',').map(s => s.trim()).filter(Boolean);
    const resolved = await Promise.all(parts.map(u => cache.resolveUrl(u)));
    a.image = resolved.join(', ');
  }
  cache.save();
  console.log('  ' + cache.report());

  writeFileSync(resolve(ROOT, 'data/activity.json'),
    JSON.stringify({ _readme: { 'источник': `Google-таблица, лист «${SHEET_NAME}»`, 'как_обновить': 'node scripts/fetch-activity.mjs (или скилл fetch-activity)' }, activities: acts }, null, 2) + '\n');

  // Локальные пути → страничные («../assets/…») для рендера; http-ссылки не трогаем.
  for (const a of acts) if (a.image) a.image = pageImages(a.image);

  // Два потока ячеек:
  //  • pageCells — ВСЕ типы (включая галереи эфиров/клипов и trans) → полноэкранная
  //    страница «Вокруг вас» (okruzhenie), куда ведёт тап по виджету.
  //  • widgetCells — только классические uni-cell-типы → горизонтальный конвейер
  //    в ленте. Карусель-портлет в конвейер не кладём (сломает горизонтальный ряд).
  const NEW_TYPES = new Set(['trans-gallery', 'clip-gallery', 'trans']);
  const pageCells = acts.map(renderCell).join('\n');
  const widgetCells = acts.filter(a => !NEW_TYPES.has(a.lead)).map(renderCell).join('\n');
  // Вариант для страниц с <base href="../"> (activity-lenta/): ассеты резолвятся
  // от корня, поэтому БЕЗ «../» (иначе ушли бы выше корня). В new-vision/* base
  // нет → там нужен «../» (как есть).
  const pageCellsBase = pageCells.replace(/\.\.\/assets\//g, 'assets/');
  const widgetCellsBase = widgetCells.replace(/\.\.\/assets\//g, 'assets/');

  // Страница «Вокруг вас» — список #activityList (после промо-баннера, до закрытия списка)
  spliceFile(
    resolve(ROOT, 'new-vision/okruzhenie.html'),
    '<!-- ACTIVITY:START (генерится scripts/fetch-activity.mjs — не редактировать) -->',
    '<!-- ACTIVITY:END -->',
    pageCells,
    '<!-- Спец-ячейка к промо',
    '\n      </div>\n\n    </div>\n\n    <ok-tabbar',
  );

  // Виджет в ленте — конвейер #activityConveyor (внутри __track)
  spliceFile(
    resolve(ROOT, 'new-vision/lenta.html'),
    '<!-- ACTIVITY-WIDGET:START (генерится scripts/fetch-activity.mjs — не редактировать) -->',
    '<!-- ACTIVITY-WIDGET:END -->',
    widgetCells,
    '          <div class="uni-cell-wrapper __type-activity __cat-win">',
    '\n          </div>\n        </div>\n      </div>',
  );

  // Виджет в ленте activity-lenta (q3-стиль, <base href="../">) — конвейер
  // #activityConveyor. Те же ячейки, но пути без «../» (см. pageCellsBase/widgetCellsBase). Маркеры
  // уже стоят в файле; вставка строго между ними.
  spliceFile(
    resolve(ROOT, 'activity-lenta/lenta.html'),
    '<!-- ACTIVITY-WIDGET:START (генерится scripts/fetch-activity.mjs — не редактировать) -->',
    '<!-- ACTIVITY-WIDGET:END -->',
    widgetCellsBase,
    '          <div class="uni-cell-wrapper __type-activity __cat-win">',
    '\n          </div>\n        </div>\n      </div>',
  );

  // Страница «Вокруг вас» в activity-lenta (q3-стиль, <base href="../">) — список
  // #activityList. Те же ячейки, пути без «../» (pageCellsBase/widgetCellsBase). Маркеры уже в файле.
  spliceFile(
    resolve(ROOT, 'activity-lenta/okruzhenie.html'),
    '<!-- ACTIVITY:START (генерится scripts/fetch-activity.mjs — не редактировать) -->',
    '<!-- ACTIVITY:END -->',
    pageCellsBase,
    '<!-- ACTIVITY:START',
    '<!-- ACTIVITY:END -->',
  );

  gate.commit();
  console.log(`✓ ${acts.length} активностей → data/activity.json + okruzhenie ×2 + nv/lenta + activity-lenta/lenta (виджеты)`);
  acts.forEach(a => console.log(`  • ${a.id.padEnd(4)} ${a.lead}`));
}

main().catch(err => { console.error('✗', err.message); process.exit(1); });
