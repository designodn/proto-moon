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
import {
  agreeGenderText,
  inflectPersonName,
  isDativeRecipientText,
  replacePersonToken,
} from './lib/activity-text.mjs';

const SPREADSHEET_ID = '1Ctwjp2J0HSmvb6kL4NoDqaB9W4QfdAXXDnzyBDLYZ7Y';
const SHEET_NAME = 'Вокруг нас';
// Тянем по СТАБИЛЬНОМУ gid (как Q3-лента), а не по имени листа: имя могут
// переименовать, и gviz по ненайденному имени молча отдаёт первый лист. gid
// переживает переименования и гарантирует, что читаем именно тот таб, где
// заведены новые ячейки (trans / trans-gallery / clip-gallery).
const SHEET_GID = '502211906';
const EVENTS_SHEET_NAME = 'События друзей';
const EVENTS_SHEET_GID = '426723569';
const FORCE = process.argv.includes('--force');   // пересобрать, даже если лист не менялся

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const csvUrl = gid =>
  `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
  `?tqx=out:csv&gid=${gid}&headers=1`;

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

/** Кнопка-действие справа — DS secondary; базовый размер ячейки 28. */
function cellButton(label, size = 28) {
  return `<div class="button-wrapper __size-${size}"><button class="button-container __style-secondary"><span class="button-content">${esc(label)}</span></button></div>`;
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
const avatarOnline = (id, size = 44) => `<div class="avatar __size-${size} __type-image __has-addon">
                  <img data-person-avatar="${esc(id)}" alt="">
                  <span class="avatar__addon __pos-bl"><span class="status-dot"></span></span>
                </div>`;

// Кэш кладёт картинки в assets/around-you/… (репо-относительно). На NV-страницах
// ассеты идут через «../», на activity-lenta (<base href="../">) — без «../»
// (это делает pageCellsBase/widgetCellsBase, срезая «../assets/»). Поэтому в рендер отдаём «../»-форму;
// http-ссылки (живой внешний CDN, если файл не скачался) не трогаем.
const pageUrl = (u) => (typeof u === 'string' && u.startsWith('assets/')) ? '../' + u : u;
const pageImages = (s) => s.split(',').map(x => x.trim()).filter(Boolean).map(pageUrl).join(', ');

// Статичные авы рубрик для section-ячеек, когда «изображение» в листе пусто:
// сопоставляем по ключевому слову текста. Файлы лежат в assets/sections/ (вне
// медиа-кэша around-you), поэтому реген их не пруниит.
const SECTION_AVATARS = [
  [/заготовк/i, 'assets/sections/zagotovki.png'],  // ВАЖНО: раньше /готов/, иначе «заГОТОВки» съест Готовку
  [/готов/i,    'assets/sections/gotovka.png'],
  [/рыбалк/i,   'assets/sections/rybalka.png'],
];
const sectionAvatar = (text) => (SECTION_AVATARS.find(([re]) => re.test(text || '')) || [, ''])[1];

const BADGES = [
  { type: 'comment',   icon: 'comment-16',      names: ['comment', 'комментарий', 'коммент'] },
  { type: 'klass',     icon: 'klass-filled',    names: ['klass', 'klasses', 'class', 'класс', 'лайк'] },
  { type: 'favourite', icon: 'favourite-filled', names: ['favourite', 'favorite', 'избранное', 'звезда'] },
  { type: 'mention',   icon: 'mention',         names: ['mention', 'упоминание'] },
  { type: 'add',       icon: 'add',             names: ['add', 'добавить', 'плюс'] },
  { type: 'radio',     icon: 'music-radio',     names: ['radio', 'live', 'эфир', 'радио'] },
  { type: 'share',     icon: 'share',           names: ['share', 'reshare', 'поделиться', 'репост'] },
  { type: 'birthday',  icon: 'cake',            names: ['birthday', 'день рождения', 'др'] },
];

function badgeElement(raw, extraClass = '') {
  const value = (raw || '').trim().toLowerCase();
  if (!value || value === 'нет бейджа' || value === 'нет') return '';
  const badge = BADGES.find(item => item.names.includes(value));
  return badge
    ? `<span class="badge __size-24 __type-${badge.type}${extraClass ? ` ${extraClass}` : ''}"><span class="icon __slot-${badge.icon}"></span></span>`
    : '';
}

const personIds = who => (who || '').split(',').map(id => id.trim()).filter(Boolean);

// Безопасная нормализация известных опечаток в контентном листе. Источник
// остаётся таблицей, но прототип не публикует заведомо неверные формы.
const normalizeActivityText = text => String(text || '')
  .replace(/вашей дружбе в ОК/gi, 'вашей дружбы в ОК')
  .replace(/\bКдип\b/gi, 'Клип');

function leadFor(a, size = 44) {
  switch (a.lead) {
    case 'person': {
      // «онлайн» — уже существующий status-dot, остальные значения — badge 24.
      if (a.online) return avatarOnline(a.who, size);
      const ids = personIds(a.who);
      const secondAvatar = ids[1]
        ? `<span class="badge-picture"><span class="avatar __size-20 __type-image"><img data-person-avatar="${esc(ids[1])}" alt=""></span></span>`
        : '';
      const addons = secondAvatar;
      return `<div class="avatar __size-${size} __type-image${addons ? ' __has-addon' : ''}"><img data-person-avatar="${esc(ids[0] || a.who)}" alt="">${addons}</div>`;
    }
    case 'discussion': {
      const ids = a.who.split(',').map(s => s.trim()).filter(Boolean);
      return `<div class="ava-cluster">
                ${ids.map(id => avatarImg(id, 24)).join('\n                ')}
              </div>`;
    }
    case 'section': {
      const sImg = a.image || pageUrl(sectionAvatar(a.text));
      return sImg
        ? `<div class="avatar __size-${size} __type-image"><img src="${esc(sImg)}" alt=""></div>`
        : `<div class="avatar __size-${size} __type-emoji" style="--avatar-bg: var(--dynamic-surface-tint-indigo);">${esc(a.who || '👥')}</div>`;
    }
    case 'photo':
      return `<div class="picture __size-${size} __type-image"><img src="${esc(a.image)}" alt=""></div>`;
    case 'photo-pair': {
      const urls = a.image.split(',').map(s => s.trim()).filter(Boolean).slice(0, 2);
      return `<div class="photo-pair">
                ${urls.map(u => `<div class="picture __type-image"><img src="${esc(u)}" alt=""></div>`).join('\n                ')}
              </div>`;
    }
    default: return avatarImg(a.who, size);
  }
}

/** Опциональный слот right на странице «События друзей».
 *  Тип берётся из «дополнение справа», источник — из «изображение (если есть)».
 *  Для avatar без отдельной картинки используем того же человека из «кто». */
function rightFor(a) {
  if (!a.right) return '';
  if (a.right === 'avatar') {
    const img = a.image
      ? `<img src="${esc(a.image.split(',')[0].trim())}" alt="">`
      : `<img data-person-avatar="${esc(personIds(a.who)[0] || a.who)}" alt="">`;
    return `<div class="activity-cell__right"><div class="avatar __size-56 __type-image">${img}</div></div>`;
  }
  if (a.right === 'photo-pair' && a.image) {
    const images = a.image.split(',').map(s => s.trim()).filter(Boolean).slice(0, 2);
    if (images.length < 2) {
      console.warn(`⚠ events:${a.id}: для photo-pair нужны 2 ссылки в колонке изображения`);
      return '';
    }
    const badge = badgeElement(a.badge, 'activity-cell__media-badge');
    const pictures = images.map(image => `<div class="picture __type-image"><img src="${esc(image)}" alt=""></div>`).join('');
    return `<div class="activity-cell__right activity-cell__media"><div class="photo-pair activity-cell__photo-pair">${pictures}</div>${badge}</div>`;
  }
  if ((a.right === 'photo' || a.right === 'clip') && a.image) {
    const image = esc(a.image.split(',')[0].trim());
    const badge = badgeElement(a.badge, 'activity-cell__media-badge');
    const className = a.right === 'clip'
      ? 'picture __type-image activity-cell__clip'
      : 'picture __size-56 __type-image';
    return `<div class="activity-cell__right activity-cell__media"><div class="${className}"><img src="${image}" alt=""></div>${badge}</div>`;
  }
  return '';
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
    : `<span class="tag __style-primary __size-20 au-tile__badge __pos-br"><span class="icon __size-16 __slot-klass-outline"></span>${n}</span>`;
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
            ${cellButton(a.button || 'Все', 36)}
          </header>
          <div class="au-gallery__row">
${row}
          </div>
        </section>`;
}

/** Компактная ячейка «в эфире» — live-превью 90×60 + ТОЛЬКО имя + «Смотреть».
 *  Число зрителей берём из текста листа («…34 смотрят») и кладём в бейдж на
 *  превью, а не в подпись (по запросу: в строке пишем только имя). */
function renderTrans(a) {
  const name = nameOf(a.who).split(/\s+/)[0];           // только имя, без фамилии
  const t = renderText(a.text, genderOf(a.who));        // «в эфире 34 смотрят» — источник числа зрителей
  const viewers = (t.match(/\d+/) || [String(seededCount(a.who + 'trans'))])[0];
  return `        <div class="uni-cell-wrapper __type-activity">
          <div class="uni-cell-container __state-enabled">
            <div class="uni-cell">
              <div class="au-trans">
                <img class="au-trans__bg" data-person-avatar="${esc(a.who)}" alt="">
                <img class="au-trans__img" data-person-avatar="${esc(a.who)}" alt="">
                <span class="tag __style-live __size-20 au-trans__badge"><span class="icon __size-16 __slot-music-radio"></span>${viewers}</span>
              </div>
              <div class="uni-cell-additional-content ds-body-m"><b>${esc(name)}</b> ${t}</div>
              ${cellButton(a.button || 'Смотреть')}
            </div>
          </div>
        </div>`;
}

/** Рендер одной activity-ячейки. */
function renderCell(a, options = {}) {
  if (a.lead === 'trans-gallery') return renderGallery(a, 'live');
  if (a.lead === 'clip-gallery')  return renderGallery(a, 'clip');
  if (a.lead === 'trans')         return renderTrans(a);

  const catClass = a.category ? ` __cat-${a.category}` : '';
  let text;
  if (a.lead === 'person') {
    const ids = personIds(a.who);
    const primaryId = ids[0] || a.who;
    const name = nameOf(primaryId);
    const gender = genderOf(primaryId);
    const dativeActor = isDativeRecipientText(a.text);
    const actionSource = agreeGenderText(a.text, gender);
    let action = renderText(actionSource, gender);
    const addressedToUser = /(?:^|\s)(?:у|для)\s+вас(?=\s|$|[,.!?])/i.test(a.text);
    const primaryIsPlaceholder = ids.length === 1 && /\bN\b/.test(a.text);
    const referencedId = ids[1] || ((addressedToUser || primaryIsPlaceholder) ? primaryId : '');
    if (referencedId) action = replacePersonToken(action, esc(nameOf(referencedId)), genderOf(referencedId));
    const actorName = dativeActor ? inflectPersonName(name, gender, 'dative') : name;
    text = (addressedToUser || primaryIsPlaceholder) ? action : `<b>${esc(actorName)}</b> ${action}`;
  } else {
    text = renderText(a.text, '');
  }
  const confetti = a.category === 'holiday' ? '\n' + CONFETTI : '';
  const right = options.withRight ? rightFor(a) : '';
  return `        <div class="uni-cell-wrapper __type-activity${catClass}">
          <div class="uni-cell-container __state-enabled">
            <div class="uni-cell">
              ${leadFor(a, options.leadSize || 44)}
              <div class="uni-cell-additional-content ds-body-m">${text}</div>
              ${cellButton(a.button)}${right ? `\n              ${right}` : ''}
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
async function getCsv(gid, sheetName, envFile) {
  if (envFile) return readFileSync(envFile, 'utf8');
  const res = await fetch(csvUrl(gid), { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} — проверь доступ к таблице и лист «${sheetName}».`);
  return res.text();
}

// Колонки ищем ПО КЛЮЧЕВОМУ СЛОВУ (заголовки в листе бывают с уточнениями,
// напр. «изображение (если есть)»; id может отсутствовать — тогда генерим).
function colIndex(header, sheetName) {
  const norm = header.map(h => h.trim().toLowerCase());
  const find = kw => norm.findIndex(h => h.includes(kw));
  const leadIndex = find('лид');
  const idx = {
    id: find('id'), lead: leadIndex >= 0 ? leadIndex : find('слева'), who: find('кто'), image: find('изображ'),
    badge: find('бейдж'), text: find('текст'), button: find('кнопк'), category: find('категори'),
    right: find('дополн'), online: find('онлайн'),
  };
  if (idx.lead < 0)
    throw new Error(`В листе «${sheetName}» нет колонки «лид». Это точно лист активностей?`);
  return idx;
}

function parseActivities(csvText, sheetName, options = {}) {
  const rows = parseCsv(csvText);
  const [header, ...body] = rows;
  const idx = colIndex(header, sheetName);
  const at = (r, i) => (i >= 0 ? (r[i] || '').trim() : '');
  const acts = [];
  let n = 0;
  for (const r of body) {
    const leadRaw = at(r, idx.lead);
    if (!leadRaw) continue;
    // Человеческое название вариации в Google Sheets → внутренний тип рендера.
    const leadAliases = { '3 avatars': 'discussion', avatar: 'person' };
    const lead = leadAliases[leadRaw.toLowerCase()] || leadRaw;
    n++;
    let category = at(r, idx.category).toLowerCase();
    if (category === 'пусто') category = '';
    const activity = {
      id: at(r, idx.id) || `a${n}`,
      lead,
      who: at(r, idx.who),
      image: at(r, idx.image),
      online: ['онлайн', 'показываем', 'да'].includes(
        at(r, idx.online >= 0 ? idx.online : idx.badge).toLowerCase(),
      ),
      text: normalizeActivityText(at(r, idx.text)),
      button: at(r, idx.button),
      category,
    };
    if (options.extended) {
      activity.badge = at(r, idx.badge).toLowerCase();
      activity.right = at(r, idx.right).toLowerCase();
    }
    acts.push(activity);
  }
  return acts;
}

function validateEventsActivities(acts) {
  const badgeNames = new Set(BADGES.flatMap(item => item.names));
  const emptyBadges = new Set(['', 'нет', 'нет бейджа', 'онлайн']);
  const rightTypes = new Set(['', 'photo', 'photo-pair', 'clip', 'avatar']);
  const specialTypes = new Set(['trans-gallery', 'clip-gallery', 'trans']);
  for (const a of acts) {
    if (!emptyBadges.has(a.badge) && !badgeNames.has(a.badge))
      console.warn(`⚠ events:${a.id}: неизвестный бейдж «${a.badge}» — скрыт`);
    if (!rightTypes.has(a.right))
      console.warn(`⚠ events:${a.id}: неизвестное дополнение справа «${a.right}» — скрыто`);
    if (specialTypes.has(a.lead) && (a.right || (!emptyBadges.has(a.badge))))
      console.warn(`⚠ events:${a.id}: badge/right применяются только к uni-cell, не к ${a.lead}`);
  }
}

async function main() {
  console.log(`→ Тяну «${SHEET_NAME}» и «${EVENTS_SHEET_NAME}»…`);
  const [csvText, eventsCsvText] = await Promise.all([
    getCsv(SHEET_GID, SHEET_NAME, process.env.ACTIVITY_CSV_FILE),
    getCsv(EVENTS_SHEET_GID, EVENTS_SHEET_NAME, process.env.EVENTS_ACTIVITY_CSV_FILE),
  ]);
  // people.json в зависимостях: жирное имя в person-ячейках запекается из него →
  // правка листа «Люди» пересобирает и виджет «Вокруг вас».
  const gate = createSyncGate({ root: ROOT, key: 'activity-around-and-events',
    codeDeps: [fileURLToPath(import.meta.url), resolve(__dirname, 'lib/media-cache.mjs'),
               resolve(__dirname, 'lib/activity-text.mjs'), resolve(ROOT, 'data/people.json')] });
  if (gate.unchanged(csvText + '\n--EVENTS--\n' + eventsCsvText) && !FORCE) {
    console.log(`✓ Оба листа без изменений — пропускаю (--force чтобы пересобрать).`);
    return;
  }
  const acts = parseActivities(csvText, SHEET_NAME);
  const eventsActs = parseActivities(eventsCsvText, EVENTS_SHEET_NAME, { extended: true });
  validateEventsActivities(eventsActs);

  // Картинки активностей (section/photo/photo-pair) — в репо: качаем локально
  // (хэш-проверка «изменилось ли», старое чистится при prune). В json кладём
  // репо-относительный путь assets/around-you/… (для рендера добавим «../» ниже).
  const cache = createMediaCache({ root: ROOT, dirRel: 'assets/around-you',
    manifestPath: resolve(ROOT, 'data/around-you-media.json') });
  for (const a of [...acts, ...eventsActs]) {
    if (!a.image) continue;
    const parts = a.image.split(',').map(s => s.trim()).filter(Boolean);
    const resolved = await Promise.all(parts.map(u => cache.resolveUrl(u)));
    a.image = resolved.join(', ');
  }
  cache.save();
  console.log('  ' + cache.report());

  writeFileSync(resolve(ROOT, 'data/activity.json'),
    JSON.stringify({ _readme: { 'источник': `Google-таблица, лист «${SHEET_NAME}»`, 'как_обновить': 'node scripts/fetch-activity.mjs (или скилл fetch-activity)' }, activities: acts }, null, 2) + '\n');
  writeFileSync(resolve(ROOT, 'data/events-activity.json'),
    JSON.stringify({ _readme: { 'источник': `Google-таблица, лист «${EVENTS_SHEET_NAME}» (gid ${EVENTS_SHEET_GID})`, 'как_обновить': 'node scripts/fetch-activity.mjs' }, activities: eventsActs }, null, 2) + '\n');

  // Локальные пути → страничные («../assets/…») для рендера; http-ссылки не трогаем.
  for (const a of acts) if (a.image) a.image = pageImages(a.image);
  for (const a of eventsActs) if (a.image) a.image = pageImages(a.image);

  // Два потока ячеек:
  //  • pageCells — ВСЕ типы (включая галереи эфиров/клипов и trans) → полноэкранная
  //    страница «Вокруг вас» (okruzhenie), куда ведёт тап по виджету.
  //  • widgetCells — только классические uni-cell-типы → горизонтальный конвейер
  //    в ленте. Карусель-портлет в конвейер не кладём (сломает горизонтальный ряд).
  const NEW_TYPES = new Set(['trans-gallery', 'clip-gallery', 'trans']);
  const pageCells = acts.map(renderCell).join('\n');
  const widgetCells = acts.filter(a => !NEW_TYPES.has(a.lead)).map(renderCell).join('\n');
  const eventsPageCellsRaw = eventsActs.map(a => renderCell(a, { leadSize: 56, withRight: true })).join('\n');
  // Виджет использует ровно тот же UI ячейки, что и страница «События друзей»:
  // лид 56 и опциональный слот right. Отличаются только контейнер/конвейер.
  const eventsWidgetCellsRaw = eventsActs
    .filter(a => !NEW_TYPES.has(a.lead))
    .map(a => renderCell(a, { leadSize: 56, withRight: true }))
    .join('\n');
  // Вариант для страниц с <base href="../"> (activity-lenta/): ассеты резолвятся
  // от корня, поэтому БЕЗ «../» (иначе ушли бы выше корня). В new-vision/* base
  // нет → там нужен «../» (как есть).
  const pageCellsBase = pageCells.replace(/\.\.\/assets\//g, 'assets/');
  const widgetCellsBase = widgetCells.replace(/\.\.\/assets\//g, 'assets/');
  // В События-ленте CTA живёт в нижнем слоте buttons и использует размер 36.
  // Базовый рендер Activity не меняем.
  const eventsWidgetCells = eventsWidgetCellsRaw.replace(/\.\.\/assets\//g, 'assets/').replace(
    new RegExp('(<div class="uni-cell-additional-content ds-body-m">)([^\\n]*)(<\\/div>)\\n\\s*(<div class="button-wrapper __size-28">[^\\n]*<\\/div>)', 'g'),
    (_, open, text, close, button) =>
      `${open.replace('ds-body-m', 'ds-body-l')}\n                <div class="uni-cell-text">${text.replace(/<b>/g, '<b class="ds-title-m">')}</div>\n                <div class="uni-cell-buttons">\n                  ${button.replace('__size-28', '__size-36')}\n                </div>\n              ${close}`,
  );
  const eventsPageCells = eventsPageCellsRaw.replace(/\.\.\/assets\//g, 'assets/').replace(
    new RegExp('(<div class="uni-cell-additional-content ds-body-m">)([^\\n]*)(<\\/div>)\\n\\s*(<div class="button-wrapper __size-28">[^\\n]*<\\/div>)', 'g'),
    (_, open, text, close, button) =>
      `${open.replace('ds-body-m', 'ds-body-l')}\n                <div class="uni-cell-text">${text.replace(/<b>/g, '<b class="ds-title-m">')}</div>\n                <div class="uni-cell-buttons">\n                  ${button.replace('__size-28', '__size-36')}\n                </div>\n              ${close}`,
  );

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


  // Та же подборка активностей для независимой «События-ленты».
  spliceFile(
    resolve(ROOT, 'events-lenta/lenta.html'),
    '<!-- ACTIVITY-WIDGET:START (генерится scripts/fetch-activity.mjs — не редактировать) -->',
    '<!-- ACTIVITY-WIDGET:END -->',
    eventsWidgetCells,
    '          <div class="uni-cell-wrapper __type-activity __cat-win">',
    '\n          </div>\n        </div>\n      </div>',
  );
  spliceFile(
    resolve(ROOT, 'events-lenta/okruzhenie.html'),
    '<!-- ACTIVITY:START (генерится scripts/fetch-activity.mjs — не редактировать) -->',
    '<!-- ACTIVITY:END -->',
    eventsPageCells,
    '<!-- ACTIVITY:START',
    '<!-- ACTIVITY:END -->',
  );

  gate.commit();
  console.log(`✓ ${acts.length} активностей «${SHEET_NAME}» → старые прототипы`);
  console.log(`✓ ${eventsActs.length} активностей «${EVENTS_SHEET_NAME}» → data/events-activity.json + events-lenta`);
  acts.forEach(a => console.log(`  • ${a.id.padEnd(4)} ${a.lead}`));
  eventsActs.forEach(a => console.log(`  • events:${a.id.padEnd(4)} ${a.lead}`));
}

main().catch(err => { console.error('✗', err.message); process.exit(1); });
