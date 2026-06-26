#!/usr/bin/env node
/**
 * fetch-q3.mjs — собирает ленты из Google-таблицы по ОБЩЕЙ Q3-схеме листа.
 *
 *   node scripts/fetch-q3.mjs                      — Q3-лента → lenta-q3.html
 *   node scripts/fetch-q3.mjs --offline            — реген Q3 из data/q3-feed.json (без сети)
 *   node scripts/fetch-q3.mjs --tribune            — лента Трибуны → tribune.html
 *   node scripts/fetch-q3.mjs --tribune --offline  — реген Трибуны из data/tribune-feed.json
 *
 * Лист трибуны имеет ту же схему/типы, что Q3-посты, поэтому рендер общий —
 * меняется только источник (gid), json-выгрузка и целевой html (см. FEEDS ниже).
 *
 * Что делает (полный аналог scripts/fetch-feed.mjs):
 *   1. тянет лист «Q3-посты» (gviz CSV) → массив постов;
 *   2. пишет data/q3-feed.json (запись «как есть» из таблицы);
 *   3. рендерит карточки в точной разметке Q3-компонентов (lenta-q3.html);
 *   4. вставляет их в lenta-q3.html между <!-- FEED:START/END -->.
 *
 * Требование: таблица открыта «всем, у кого есть ссылка».
 *
 * Отличия от NV-ленты:
 *   • авторы Q3 запекаются в разметку inline (имя + URL аватара), реестр —
 *     data/people.json (имя = name, аватар = photo). Исключение — vvz-portlet:
 *     там оставляем data-person-* атрибуты (резолвит components/people-data.js);
 *   • ассеты лежат в корне репозитория → пути без «../» (assets/icons/…);
 *   • компаньон-данные (то, чего нет в плоских колонках листа) держим в COMPANION,
 *     привязанными к ТИПУ карточки — main() разложит их по актуальным id постов.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createMediaCache } from './lib/media-cache.mjs';

const SPREADSHEET_ID = '1Ctwjp2J0HSmvb6kL4NoDqaB9W4QfdAXXDnzyBDLYZ7Y';

// Один скрипт обслуживает две ленты с ОДИНАКОВОЙ схемой/типами листа:
//   • Q3-лента      — node scripts/fetch-q3.mjs            → lenta-q3.html
//   • Трибуна       — node scripts/fetch-q3.mjs --tribune  → tribune.html
// Меняется только лист-источник (gid), json-выгрузка и целевой html. Рендер
// карточек (text-feed / caf-* / fc-комменты) общий — типы листов совпадают.
const FEEDS = {
  q3: {
    name: 'Q3-посты',  gid: '1662648328',     // стабильный gid листа Q3-постов
    json: 'data/q3-feed.json', html: 'lenta-q3.html',
    cmd: 'scripts/fetch-q3.mjs',              // подпись в маркере FEED:START
  },
  tribune: {
    name: 'Трибуна',   gid: '803749593',      // лист трибуны (та же схема, что Q3)
    json: 'data/tribune-feed.json', html: 'tribune.html',
    cmd: 'scripts/fetch-q3.mjs --tribune',
    // Фото запекаются в tribune.html (корень) → кэшируем локально, чтобы не
    // зависеть от чужих CDN. У Q3 кэш не включён (mediaDir не задан).
    mediaDir: 'assets/tribune', mediaManifest: 'data/tribune-media.json',
  },
  activity: {
    // Activity-лента (дубль q3-стиля) — лист «lenta-activity» (та же схема/типы,
    // что Q3-посты). Целевой html — в подпапке activity-lenta/, где стоит
    // <base href="../">, поэтому пути ассетов БЕЗ «../» (как у Q3 в корне)
    // резолвятся корректно — рендер общий, ничего не меняем.
    name: 'lenta-activity', gid: '2116709014',
    json: 'data/activity-feed.json', html: 'activity-lenta/lenta.html',
    cmd: 'scripts/fetch-q3.mjs --activity',
    tabs: true,   // вверху первого НЕ-ВВЗ поста — таб-стрип «Лента/Сегодня/…»
  },
};
const IS_TRIBUNE = process.argv.includes('--tribune');
const IS_ACTIVITY = process.argv.includes('--activity');
const CHECK_ONLY = process.argv.includes('--check');
const FEED = FEEDS[IS_TRIBUNE ? 'tribune' : (IS_ACTIVITY ? 'activity' : 'q3')];
const SHEET_NAME = FEED.name;                 // человекочитаемое имя листа (для логов)
const SHEET_GID = FEED.gid;                   // стабильный gid листа (или null → тянем по имени)

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Тянем по gid, а НЕ по имени листа: имя листа могут переименовать в таблице,
// и gviz при ненайденном имени молча отдаёт первый лист («Люди») — из-за чего
// раньше лента собиралась из чужой схемы и обнулялась. gid переживает переименования.
//
// headers=1 — принудительно одна строка шапки. Без него gviz авто-детектит шапку
// и для post-1 (vvz-portlet без счётчиков лайков/комментов/репостов) ошибочно
// считает ДВЕ строки шапки → склеивает их в подписи колонок, а post-1 теряется.
// Источник: по стабильному gid (предпочтительно), либо по имени листа, если gid
// ещё не известен (новый лист «lenta-activity»). gviz с явным sheet=<имя> тянет
// именно его (а не первый лист), пока имя не переименовали.
const csvUrl = SHEET_GID
  ? `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
    `?tqx=out:csv&gid=${SHEET_GID}&headers=1`
  : `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
    `?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&headers=1`;

/* ── Компаньон-данные (то, чего нет в плоских колонках листа) ──────────────── */
/* Вложенные куски не лезут в колонки таблицы, поэтому держим их здесь и вешаем
 * на ТИП карточки. main() разложит их по актуальным id — перенумерация строк
 * в листе ничего не ломает. Дефолты выбраны «разумно по эталону lenta-q3.html». */
const COMPANION = {
  // on-this-day: блок «понравилось» под reshare-card (аватары — id из people.json)
  'on-this-day': {
    likes: {
      avatars: [3, 5, 7],
      text: 'Понравилось 4 людям',
    },
  },
  // added-friend: общие друзья добавленного друга (verified + аватары — id из people.json)
  'added-friend': {
    friend: {
      verified: true,
      subtitle: '20 общих друзей',
      mutuals: [1, 3, 9],
    },
  },
  // shared-link: title/description превью (домен выводим из host ссылки)
  'shared-link': {
    title: 'РБК — последние новости дня в России и мире сегодня',
    description: 'Главные новости политики, экономики и бизнеса, общество, технологии, спорт, мнения и интервью.',
  },
  // tagged-photo: hero-аватар + координаты тултипа. Имя в теге = имя автора
  // поста (personName), tag.name — только фолбэк, если у автора нет имени.
  'tagged-photo': {
    heroAvatar: 'https://i.pravatar.cc/192?img=49',
    tag: { name: 'Анастасия Кащеева', top: 143, left: 187.5 },
  },
  // clip: локальное видео из репы (как clip-feed в NV-ленте), если в листе нет своего
  clip: { fallbackMedia: 'assets/clips/sable-tepa.mp4' },
  // memories-clip: подпись-период на медиа + подборка кадров, сменяющих друг
  // друга, если в листе не задали свои фото. Подпись («Лето 2026») — из
  // колонки «text», иначе дефолт ниже.
  'memories-clip': {
    label: 'Лето 2026',
    fallbackPhotos: [
      'https://avatars.dzeninfra.ru/get-zen_doc/271828/pub_67beb36e89ba58323c122836_67bf621e4c2ad61145bc261a/scale_1200',
      'https://avatars.dzeninfra.ru/get-zen_doc/1714257/pub_5dc141ab9c944600aeb23c3c_5dc14c2e5eb26800b0a355c1/scale_1200',
      'https://i.okcdn.ru/i?r=CFNAm_VFBkioSGBqh1J9ETTobTlga7zkwH59p_epNx4IRT8OXpmbNViFJLp-Sd4uConiI3gx0-dYYxWQvDOqJIO3rZ2mtKvnIsMH9ao9D_abwXZkAAAAKQ&dpr=2&fn=w_790',
    ],
  },
};

// vvz-portlet: ФОЛБЭК подзаголовков карточек (по порядку id из «автор»), если у
// персоны не заполнено поле subtitle в people.json (лист «Люди»). Основной
// источник «N общих друзей» — people.json (см. case 'vvz-portlet').
const VVZ_SUBTITLES = ['20 общих друзей', '12 общих друзей', '12 общих друзей', '10 общих друзей'];

// reshare-post: автор вложенной карточки (внутренняя шапка), если не задан иначе
const RESHARE_INNER_AUTHOR = 8;

// Заполняется в main(): EXTRAS[post.id] = COMPANION[post.type] (привязка к типу).
const EXTRAS = {};

/* Дефолтное время поста — только HH:MM (относительный день проставляет
 * components/feed-date.js по позиции в ленте: верх = сегодня → вчера → «12 мая»). */
const TIMES = ['9:12', '12:48', '18:02', '12:03', '10:05', '8:42', '21:10', '14:02', '11:18', '7:30', '20:10', '9:33', '17:46', '12:48', '15:20', '12:48'];

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

/* ── people.json: имена/аватары для рендера ──────────────────────────────────── */
const peopleRaw = JSON.parse(readFileSync(resolve(ROOT, 'data/people.json'), 'utf8')).people;
const PEOPLE = {};
peopleRaw.forEach(p => { PEOPLE[String(p.id)] = p; });

const isGroupId = id => /^group-/.test(String(id));
const personName = id => PEOPLE[String(id)]?.name || '';
const personPhoto = id => PEOPLE[String(id)]?.photo || '';
const personGender = id => PEOPLE[String(id)]?.gender || '';   // 'м' | 'ж' | ''
const splitIds = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

/* Подстановка имени: токен «<id>_name» в заголовках/текстах → имя человека из
 * people.json (только имя — без фамилии и скобок). Так в листе можно писать
 * «my_profile_name, поздравляем …», а реальное имя проставит скрипт сам.
 * Ids сортируем по длине убыванием, чтобы длинные («my_profile») матчились
 * раньше коротких. */
const firstName = id => personName(id).split(/[ (]/)[0];
const NAME_IDS = Object.keys(PEOPLE).sort((a, b) => b.length - a.length);
const resolveNames = str => {
  let s = String(str ?? '');
  for (const id of NAME_IDS) {
    const token = id + '_name';
    if (s.includes(token)) s = s.split(token).join(firstName(id));
  }
  return s;
};

/* ── helpers разметки ───────────────────────────────────────────────────────── */
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Текст карточки-годовщины (заголовок/подзаголовок): экранируем, перевод
 * строки из ячейки (Alt/Option+Enter в Google-таблице) → <br>, и приклеиваем
 * «висячие» предлоги/союзы к следующему слову неразрывным пробелом. */
const HANG_WORDS = ['а','в','и','к','о','с','у','я','во','до','за','из','ко','на','не','об','от','по','со','то'];
const HANG_RE = new RegExp('(^|[\\s>(«"])(' + HANG_WORDS.join('|') + ')\\s+', 'gi');
// nbsp() — приклеивает «висячие» предлоги/союзы к следующему слову неразрывным
// пробелом. Применяется ко всей прозе карточек (заголовок/текст/описание/комменты)
// ДО esc() —   экранирование не трогает, так что переживает шаблоны.
const nbsp = s => String(s ?? '').replace(HANG_RE, (_, pre, w) => pre + w + ' ');
// noWidow — приклеивает ПОСЛЕДНЕЕ слово к предыдущему неразрывным пробелом
// (U+00A0), чтобы одно слово не «улетало» одиночкой на новую строку.
const noWidow = s => String(s ?? '').replace(/\s+(\S+)\s*$/, ' $1');
const annivProse = s => esc(String(s ?? ''))
  .replace(/\r\n?|\n/g, '<br>')
  .replace(HANG_RE, (_, pre, w) => pre + w + ' ');

const img = (url, attr = '') => `<img ${attr}src="${esc(url)}" alt="">`;

/* ── ФОТОМАРАФОН ──────────────────────────────────────────────────────────────
 * Колонка «марафон» = хэштег марафона (без «#» — подставим сами). Непустое
 * значение у обычного поста → под ним рисуется блок-модификатор .text-feed__marathon.
 * Колонка «участвую» (опц., «да») → joined-состояние: серая кнопка + текст
 * «Вы уже участвуете…». Счётчик участников и текст CTA — реквизит шаблона. */
const marathonHashtag = raw => {
  const s = String(raw || '').trim();
  return s ? (s.startsWith('#') ? s : '#' + s) : '';
};
const MARATHON_PARTICIPANTS = '11К участников';

/** Промо-блок (призыв + счётчик), общий для модификатора и отдельного фида. */
function marathonPromo(hashtag, joined) {
  const text = joined
    ? 'Вы уже участвуете, посмотрите другие фото марафона '
    : 'Загружайте фото и участвуйте в марафоне ';
  return `            <div class="marathon-promo">
              <p class="ds-title-m marathon-promo__text">${esc(text)}<span class="marathon-promo__tag">${esc(hashtag)}</span></p>
              <p class="ds-body-m marathon-promo__count">${MARATHON_PARTICIPANTS}</p>
            </div>`;
}

/** Блок-модификатор под обычным постом (divider + промо + CTA). */
function marathonBlock(raw, joined) {
  const hashtag = marathonHashtag(raw);
  if (!hashtag) return '';
  const style = joined ? 'secondary' : 'primary';
  return `
          <div class="text-feed__marathon">
${marathonPromo(hashtag, joined)}
            <div class="button-wrapper __size-36 __full-width" style="display:block">
              <button class="button-container __style-${style}" style="width:100%" data-href="marathon.html"><span class="button-content">Перейти к фотомарафону</span></button>
            </div>
          </div>`;
}

/** Распознаём «да/yes/1/true» в колонке «участвую». */
const isJoined = v => /^(да|yes|1|true)$/i.test(String(v || '').trim());

/** Шапка автора (uni-cell): аватар __size-44, имя ds-title-s, время text-feed__time.
 *  Имя и URL аватара запекаются inline из people.json. Для group-* добавляем
 *  кнопку «Подписаться» (button-subscribe), как в эталонной карточке 4. */
function authorHeader(id, time, { subscribe = false } = {}) {
  // Кнопка «Подписаться» — на ОДНОЙ строке с именем (feed-header__line) внутри
  // текстовой колонки, время — строкой ниже (эталон Figma 4833-29163). Имя тянется
  // (эллипсис, feed-header__name), кнопка прижата вправо и центрируется по строке.
  const btn = `<label class="button-wrapper __size-28 button-subscribe"><input type="checkbox" hidden><span class="button-container __style-secondary"><span class="button-content"><span class="button-subscribe__label-default">Подписаться</span><span class="button-subscribe__label-subscribed">Подписан</span></span></span></label>`;
  const nameLine = subscribe
    ? `<div class="feed-header__line"><div class="ds-title-s feed-header__name">${esc(personName(id))}</div>${btn}</div>`
    : `<div class="ds-title-s">${esc(personName(id))}</div>`;
  return `          <div class="uni-cell-wrapper"><div class="uni-cell-container"><div class="uni-cell">
            <div class="avatar __size-44 __type-image">${img(personPhoto(id))}</div>
            <div class="uni-cell-additional-content">
              ${nameLine}
              <div class="ds-caption-s text-feed__time" data-feed-hm="${esc(time)}"></div>
            </div>
          </div></div></div>`;
}

/** Компактная шапка постов Трибуны: иконка 20 + имя (ds-title-s) + «Подписаться»
 *  (button __size-28) справа. Без времени и крошек. Стили/центрирование/высота
 *  (= аватарка) — модификатор .feed-header.__tribune (components/feed-header.css). */
function authorHeaderTribune(id) {
  return `          <header class="feed-header __tribune __no-breadcrumbs">
            <div class="uni-cell-wrapper"><div class="uni-cell-container"><div class="uni-cell">
              <div class="avatar __size-20 __type-image">${img(personPhoto(id))}</div>
              <div class="uni-cell-additional-content">
                <div class="ds-title-s feed-header__name">${esc(personName(id))}</div>
              </div>
              <label class="button-wrapper __size-28 button-subscribe">
                <input type="checkbox" hidden>
                <span class="button-container __style-secondary"><span class="button-content"><span class="button-subscribe__label-default">Подписаться</span><span class="button-subscribe__label-subscribed">Подписан</span></span></span>
              </label>
            </div></div></div>
          </header>`;
}

/** Хлебные крошки из колонок «тема»/«рубрика» (последняя — активная). Если обе
 *  пусты → ''. Разметка как в комментах-как-фид и в NV-ленте. */
function breadcrumbs(tema, rubrika, extraClass = '') {
  if (!tema && !rubrika) return '';
  return `            <nav class="breadcrumbs${extraClass ? ' ' + extraClass : ''}">${tema ? `
              <a class="breadcrumbs__item" href="#">${esc(tema)}</a>` : ''}${(tema && rubrika) ? `
              <span class="breadcrumbs__separator" aria-hidden="true"></span>` : ''}${rubrika ? `
              <span class="breadcrumbs__item __state-on">${esc(rubrika)}</span>` : ''}
            </nav>`;
}

/** Шапка comment-as-feed (модификатор .feed-header.__caf): крошки сверху +
 *  автор-комментатор (ава 44 с доп-авой того, К КОМУ коммент) + подзаголовок
 *  «Комментарий к <автор оригинала>». commenter — ids[0] (большая ава, имя),
 *  to — ids[1] (маленькая доп-ава, может быть и сообществом group-*). Если to
 *  не задан — доп-ава и подзаголовок не выводятся. «Подписаться» — справа. */
function cafHeader(commenter, to) {
  const addon = to ? `
              <div class="avatar __size-20 __type-image feed-header__ava-addon">${img(personPhoto(to))}</div>` : '';
  const sub = to ? `
                <div class="ds-caption-m feed-header__sub">Комментарий к <span class="feed-header__to">${esc(personName(to))}</span></div>` : '';
  return `            <div class="uni-cell-wrapper"><div class="uni-cell-container"><div class="uni-cell">
              <div class="avatar __size-44 __type-image${to ? ' __has-addon' : ''}">${img(personPhoto(commenter))}${addon}
              </div>
              <div class="uni-cell-additional-content">
                <div class="ds-title-s feed-header__name">${esc(personName(commenter))}</div>${sub}
              </div>
              <label class="button-wrapper __size-28 button-subscribe">
                <input type="checkbox" hidden>
                <span class="button-container __style-secondary"><span class="button-content"><span class="button-subscribe__label-default">Подписаться</span><span class="button-subscribe__label-subscribed">Подписан</span></span></span>
              </label>
            </div></div></div>`;
}

/** Строка-активность над автором («почему пост в ленте»), слот text-feed__activity.
 *  Колонка «шапка». Токен id_<id> → имя человека из people.json (жирным):
 *  «id_2 поставил класс» → «<b>Имя</b> поставил класс». '' — если шапки нет.
 *  Глагол сразу после имени спрягаем по полу человека (people.json → gender):
 *  для «ж» муж. прошедшее на «-л» → жен. «-ла» («поставил» → «поставила»);
 *  «м» и неизвестный пол оставляем как написано (муж. род по умолчанию). */
function activityLine(header) {
  if (!header) return '';
  // noWidow — чтобы последнее слово шапки не «улетало» одиночкой на новую строку.
  const parts = String(noWidow(header)).split(/id_([\w-]+)/);   // [текст, id, текст, id, …]
  let html = '';
  let feminize = false;   // следующий текст идёт сразу после женского имени → спрягаем глагол
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      // id-токен → имя жирным; запоминаем пол для спряжения глагола следом.
      feminize = personGender(parts[i]) === 'ж';
      // Полное имя (ФИ), не только имя — целиком в title S.
      html += `<span class="ds-title-s">${esc(personName(parts[i]) || parts[i])}</span>`;
    } else {
      let seg = parts[i];
      // Первое слово после женского имени — глагол: муж. «-л» → жен. «-ла».
      // Границу слова через lookahead (\b в JS не видит кириллицу), учитываем
      // и неразрывный пробел U+00A0 от noWidow.
      if (feminize) {
        seg = seg.replace(/^(\s*)([А-Яа-яЁё]+л)(?=\s| |$)/, '$1$2а');
        feminize = false;   // спрягаем только глагол, идущий сразу за именем
      }
      html += esc(seg);
    }
  }
  // ds-body-m — как текст обычного поста в ленте, рядом с которым стоит шапка.
  return `          <div class="text-feed__activity ds-body-m">${html}</div>\n`;
}

/** Centralized «…ещё / Скрыть» — единый inline-механизм для тела поста, caf-text
 *  и комментариев. Длинный (> clamp симв.) текст режем по границе слова: видимая
 *  «голова» + скрытый «хвост» (feed-more__full). «…ещё» приклеено к концу головы
 *  (последним словом на строке — между головой/хвостом/кнопкой НЕТ пробелов и
 *  переносов). Развёрнуто — полный текст + «Скрыть» с новой строки. Короткий →
 *  простой <p>. Размер «…ещё»/«Скрыть» = размеру текста (кнопка лежит ВНУТРИ
 *  абзаца, наследует font). Стили — components/feed-more.css. */
const CLAMP = 160;      // тело поста (ds-body-m, полная ширина карточки)
const CAF_CLAMP = 120;  // крупный текст коммента-как-поста (.caf-text, 24px)
const FC_CLAMP = 130;   // комментарии под постом (.fc-comment__text, узкая колонка)
function clampMore(text, { textClass = 'ds-body-m text-feed__body', clamp = CLAMP } = {}) {
  const s = String(text ?? '');
  if (!s) return '';
  // feed-more__text снимает line-clamp у caf/комментов и в коротком варианте тоже.
  if (s.length <= clamp) {
    return `          <p class="${textClass} feed-more__text">${esc(s)}</p>`;
  }
  let cut = s.lastIndexOf(' ', clamp);
  if (cut < clamp * 0.5) cut = clamp;
  let head = s.slice(0, cut);
  const tail = s.slice(cut); // начинается с пробела — отступ перед хвостом сохраняется
  // Если видимая «голова» кончается знаком препинания — прячем его в превью
  // (переносим в скрытый хвост): «…» должно приклеиваться к слову, а не к запятой.
  // В развёрнутом виде знак возвращается (full = punct + tail = исходный текст).
  let full = tail;
  const punct = head.match(/[.,;:!?…·–—]+$/);
  if (punct && head.length > punct[0].length) {
    head = head.slice(0, -punct[0].length);
    full = punct[0] + tail;
  }
  return `          <label class="feed-more">
            <input type="checkbox" hidden>
            <p class="${textClass} feed-more__text">${esc(head)}<span class="feed-more__full">${esc(full)}</span><span class="feed-more__btn"><span class="feed-more__show">…&nbsp;ещё</span><span class="feed-more__hide">Скрыть</span></span></p>
          </label>`;
}

/** Текстовый блок поста: длинный → сворачиваемый, иначе простой <p>.
 *  bodyClass — класс параграфа (text-feed__body по умолчанию). */
function feedText(text, { bodyClass = 'ds-body-m text-feed__body' } = {}) {
  return clampMore(text, { textClass: bodyClass, clamp: CLAMP });
}

/** caf-text (comment-as-feed): крупный текст коммента — тот же inline-механизм.
 *  Типографика ds-title-l (размер из токена), но вес форсированно регулярный
 *  (см. .caf-text.ds-title-l в comment-as-feed.css). */
function cafText(title) {
  return clampMore(title, { textClass: 'caf-text ds-title-l', clamp: CAF_CLAMP });
}

/** Текст коммента в twitter-like-раскладке (.caf.__twitter-like): не крупный
 *  caf-text, а обычный body-m, как тело поста в ленте (тот же inline-«ещё»). */
function cafTextTw(title) {
  return clampMore(title, { textClass: 'ds-body-m text-feed__body caf__text', clamp: CLAMP });
}

/** Инлайн-счётчик для actions twitter-like: button-inline 16 tertiary,
 *  иконка-маска + число. 0/пусто → только иконка (число не выводим). */
function inlineCount(slot, n) {
  const num = parseInt(n, 10);
  const label = (Number.isFinite(num) && num > 0) ? esc(String(num)) : '';
  return `              <span class="button-inline-wrapper __size-20 __view-tertiary"><button class="button-inline __size-20"><span class="button-inline__content"><span class="button-inline__icon icon __size-16 __slot-${slot}"></span>${label}</span></button></span>`;
}

/** Ряд из 3 счётчиков twitter-like: комментарии · репосты (reshare) · классы. */
function cafActions(comments, reshares, likes) {
  return `              <div class="caf__actions">
${inlineCount('comment', comments)}
${inlineCount('reshare', reshares)}
${inlineCount('klass-outline', likes)}
              </div>`;
}

/** Медиа базового feed-text: 1 фото → __single, N фото → __row (квадратные ячейки). */
function media(photos) {
  if (!photos.length) return '';
  if (photos.length === 1) {
    return `          <div class="text-feed__media __single">${img(photos[0], 'style="width:100%; height:100%; object-fit:cover; display:block" ')}</div>`;
  }
  // Галерея — как в NV-ленте: 2-колоночный грид .media.__type-gallery (DS, components/media.css),
  // максимум 4 ячейки, на 4-й — плашка «Ещё N», если фото больше четырёх.
  // text-feed__media выводит грид из паддинга карточки (full-bleed).
  const cells = photos.slice(0, 4).map((u, i) => {
    const attrs = (i === 3 && photos.length > 4) ? ` __more" data-more="${photos.length - 3}"` : '"';
    return `            <div class="media__cell${attrs}>${img(u)}</div>`;
  }).join('\n');
  return `          <div class="text-feed__media media __type-gallery">
${cells}
          </div>`;
}

/** Иконка экшена (NV-пак лежит в assets/icons, путь без «../»). */
const llIcon = (file, cls = 'll-icon', w = 20) =>
  `<img class="${cls}" src="assets/icons/${file}" width="${w}" height="${w}" alt="">`;

/** Кнопка-счётчик (comment / reshare). Нет значения или 0 → только иконка
 *  (число не выводим). */
function countBtn(file, n, { style = 'secondary' } = {}) {
  const num = parseInt(n, 10);
  const label = (Number.isFinite(num) && num > 0) ? esc(String(num)) : '';
  return `            <div class="button-wrapper __size-36"><button class="button-container __style-${style}"><span class="button-content">${llIcon(file)}${label}</span></button></div>`;
}

/** Кнопка «класс» с --button-klass-count. Нет значения или 0 → только иконка
 *  (класс __no-count прячет нулевой счётчик через CSS; после тапа counter-increment
 *  делает 1 и счётчик снова виден — см. components/actions-bar.css). */
function klassBtn(likes, { style = 'secondary' } = {}) {
  const num = parseInt(likes, 10);
  const has = Number.isFinite(num) && num > 0;
  return `            <label class="button-wrapper __size-36 button-klass${has ? '' : ' __no-count'}" style="--button-klass-count: ${has ? num : 0};"><input type="checkbox" hidden><span class="button-container __style-${style}"><span class="button-content">${llIcon('klass_16_20.svg', 'll-icon button-klass__icon-outline')}<img class="ll-icon button-klass__icon-filled" src="assets/badges/ico_klass_colored_16_20.svg" width="20" height="20" alt=""><span class="button-klass__count"></span></span></span></label>`;
}

/** «Троеточие» (__pinned-end). */
function moreBtn({ style = 'secondary' } = {}) {
  return `            <div class="button-wrapper __size-36 __pinned-end"><button class="button-container __style-${style}" aria-label="Ещё"><span class="button-content">${llIcon('more_16_20.svg')}</span></button></div>`;
}

/** Полный actions-bar: comment · reshare · класс · троеточие. */
function actionsBar(likes, comments, reshares, { style = 'secondary' } = {}) {
  return `          <div class="actions-bar">
${countBtn('comment_16_20.svg', comments, { style })}
${countBtn('reshare_16_20.svg', reshares, { style })}
${klassBtn(likes, { style })}
${moreBtn({ style })}
          </div>`;
}

/* SVG «поделиться» (из эталона) — переиспользуем в on-this-day / tagged-photo. */
const SHARE_SVG = `<svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.1645 4.65638C3.4702 5.38788 1.593 7.80098 0.689897 10.0403L0.689197 10.0422C0.383997 10.8042 0.633197 11.6762 1.2949 12.162C1.9533 12.6453 2.854 12.6245 3.4892 12.1127C4.3669 11.458 5.4623 10.9827 7.1645 10.7663L7.1644 11.6697C7.1644 12.3734 7.5744 13.0125 8.214 13.3059C8.8536 13.5992 9.6055 13.4929 10.1388 13.0338L14.9137 8.92308C15.3114 8.58068 15.5398 8.08188 15.5393 7.55708C15.5388 7.03238 15.3093 6.53398 14.9109 6.19248L10.136 2.09858C9.6023 1.64098 8.851 1.53598 8.2123 1.82968C7.5737 2.12338 7.1644 2.76208 7.1644 3.46508L7.1645 4.65638ZM8.0696 6.12808C8.4673 6.07528 8.7644 5.73618 8.7644 5.33498V3.46508C8.7644 3.38698 8.8099 3.31598 8.8808 3.28338C8.9518 3.25078 9.0352 3.26238 9.0945 3.31318L13.8695 7.40718C13.9137 7.44508 13.9392 7.50048 13.9393 7.55878C13.9394 7.61708 13.914 7.67248 13.8698 7.71048L9.0949 11.8213C9.0356 11.8723 8.9521 11.8841 8.881 11.8515C8.81 11.8189 8.7644 11.7479 8.7644 11.6698V9.88518C8.7644 9.66338 8.6723 9.45158 8.5101 9.30018C8.3479 9.14888 8.1301 9.07178 7.9088 9.08718C5.2768 9.27048 3.7337 9.93058 2.513 10.8451C2.504 10.8519 2.4952 10.8588 2.4865 10.8659C2.4159 10.9236 2.3153 10.9262 2.2418 10.8722C2.1684 10.8184 2.1407 10.7217 2.1744 10.6372C2.9618 8.68578 4.655 6.58118 8.0696 6.12808Z" fill="currentColor"/></svg>`;

/* Иконка «глаз» бейджа «Видите только вы» (из эталона). */
const EYE_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M2.73401 4.68055L1.12801 3.07055C0.796007 2.74055 0.796007 2.20055 1.12801 1.87055C1.46001 1.54055 1.99801 1.54055 2.33001 1.87055L4.09601 3.64055C5.21101 2.93055 6.55501 2.46055 8.00001 2.46055C10.333 2.46055 12.408 3.70055 13.69 5.09055C14.625 6.10055 15.123 7.21055 15.123 8.00055C15.123 8.79055 14.625 9.90055 13.69 10.9105C13.338 11.2905 12.925 11.6705 12.463 12.0005L14.051 13.5905C14.383 13.9205 14.383 14.4605 14.051 14.7905C13.72 15.1205 13.181 15.1205 12.849 14.7905L10.944 12.8905H10.935L9.69801 11.6505H9.70801L8.89501 10.8405H8.88601L5.18001 7.14055L5.18301 7.13055L3.86301 5.81055H3.85701L2.72701 4.68055H2.73401ZM1.45701 6.24055L2.62801 7.41055C2.53201 7.62055 2.47901 7.83055 2.47701 8.01055C2.47401 8.50055 2.88201 9.17055 3.48101 9.82055C4.32801 10.7405 5.60301 11.5905 7.07301 11.8605L8.71701 13.5005C8.48201 13.5305 8.24201 13.5405 8.00001 13.5405C5.66801 13.5405 3.58701 12.3005 2.30401 10.9005C1.36701 9.88055 0.871007 8.77055 0.877007 7.99055C0.881007 7.50055 1.07901 6.88055 1.45701 6.24055ZM11.316 10.8605C11.774 10.5505 12.177 10.1905 12.514 9.83055C13.114 9.17055 13.523 8.51055 13.523 8.00055C13.523 7.49055 13.114 6.83055 12.514 6.17055C11.494 5.07055 9.85501 4.06055 8.00001 4.06055C7.00101 4.06055 6.06601 4.35055 5.25801 4.80055L6.15401 5.69055C6.66001 5.27055 7.30801 5.03055 8.01301 5.03055C9.64601 5.03055 10.974 6.36055 10.974 8.00055C10.974 8.70055 10.73 9.35055 10.318 9.86055L11.316 10.8605ZM9.17201 8.71055L7.29701 6.84055C7.50301 6.70055 7.74901 6.63055 8.01301 6.63055C8.76601 6.63055 9.37401 7.24055 9.37401 8.00055C9.37401 8.26055 9.30201 8.51055 9.17201 8.71055Z" fill="currentColor"/>
            </svg>`;

/* SVG verified-бейдж (из эталона added-friend). */
const VERIFIED_SVG = `<svg class="ll-badge-verified" width="16" height="16" viewBox="0 0 16 16" aria-label="Verified" role="img">
                    <circle cx="8" cy="8" r="8" fill="#018DEB"/>
                    <path d="M4.4 8.2 L6.9 10.6 L11.6 5.9" stroke="white" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>`;

/** Стек аватаров (avatars-view) по списку URL. */
// Стопка аватаров. На вход — id людей из people.json: рендерим через
// data-person-avatar (резолвит components/people-data.js), как avatars-view в NV.
function avatarsStack(ids, extraClass = '') {
  const stack = ids.map(id =>
    `                <div class="avatar __size-36 __type-image"><img data-person-avatar="${esc(id)}" alt=""></div>`).join('\n');
  return `            <div class="avatars-view __size-36${extraClass ? ' ' + extraClass : ''}">
              <div class="avatars-view__stack">
${stack}
              </div>`;
}

/** Домен превью из URL (host без www). */
function linkDomain(url) {
  try { return new URL(url).host.replace(/^www\./, ''); }
  catch { return ''; }
}

/** content атрибут <meta property|name="KEY">, устойчиво к порядку атрибутов. */
function metaContent(html, key) {
  const keyRe = new RegExp(`(?:property|name)=["']${escRe(key)}["']`, 'i');
  const m = html.match(new RegExp(`<meta\\b[^>]*>`, 'gi')) || [];
  for (const tag of m) {
    if (keyRe.test(tag)) {
      const c = tag.match(/content=["']([^"']*)["']/i);
      if (c && c[1].trim()) return c[1].trim();
    }
  }
  return '';
}

/** Тянет заголовок + первый абзац (описание) статьи по ссылке (og: → twitter: →
 *  <title>/meta description). Возвращает {title, description} или null. */
async function fetchLinkMeta(url) {
  const decode = s => s
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; proto-moon/1.0)' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    let title = metaContent(html, 'og:title') || metaContent(html, 'twitter:title');
    if (!title) { const t = html.match(/<title[^>]*>([^<]+)<\/title>/i); title = t ? t[1].trim() : ''; }
    let description = metaContent(html, 'og:description')
      || metaContent(html, 'description') || metaContent(html, 'twitter:description');
    title = decode(title); description = decode(description);
    return (title || description) ? { title, description } : null;
  } catch { return null; }
}

/* ── комменты под постом (компонент feed-comment, fc-*) ──────────────────────── */
/* Один коммент по макету «comment v0.2»: ручка-ответ + ава 20 слева, имя
 * (title-s), текст (body-m), действия «Ответить · Класс» (кнопки size-20,
 * у «Ответить» иконки нет). Имя/ава запекаются inline из people.json. */
function commentItem(authorId, text, { tw = false, time = '' } = {}) {
  const body = `${clampMore(nbsp(resolveNames(text)), { textClass: 'fc-comment__text ds-body-m', clamp: FC_CLAMP })}
                <div class="fc-comment__actions">
                  <span class="button-inline-wrapper __size-20 __view-tertiary"><button class="button-inline __size-20"><span class="button-inline__content">Ответить</span></button></span>
                  <span class="button-inline-wrapper __size-20 __view-tertiary"><button class="button-inline __size-20"><span class="button-inline__content"><span class="button-inline__icon icon __size-16 __slot-klass-outline"></span>Класс</span></button></span>
                </div>`;
  // twitter-like (внутри comment-as-feed): тот же твиттер-ряд, что и карточка
  // выше — ава 44 + «палка»-трунк слева, имя + «· время» в head (как caf__head).
  // Палку вниз у последнего ответа гасит CSS (:not(:has(~ .fc-comment))).
  if (tw) {
    return `            <div class="fc-comment __twitter-like">
              <div class="fc-comment__aside">
                <div class="avatar __size-44 __type-image">${img(personPhoto(authorId))}</div>
                <span class="fc-comment__line" aria-hidden="true"></span>
              </div>
              <div class="fc-comment__body">
                <div class="fc-comment__head">
                  <span class="ds-title-s fc-comment__author">${esc(personName(authorId))}</span>${time ? `
                  <span class="ds-body-m fc-comment__date">· ${esc(time)}</span>` : ''}
                </div>
${body}
              </div>
            </div>`;
  }
  return `            <div class="fc-comment">
              <div class="fc-comment__aside">
                <span class="fc-comment__handle" aria-hidden="true"></span>
                <div class="avatar __size-20 __type-image">${img(personPhoto(authorId))}</div>
              </div>
              <div class="fc-comment__body">
                <div class="fc-comment__author ds-title-s">${esc(personName(authorId))}</div>
${body}
              </div>
            </div>`;
}

/** Блок комментов под карточкой (fc-list + fc-input). '' — если нет ни одного. */
function renderCommentThread(p) {
  const list = p.threadComments || [];
  if (!list.length) return '';
  // comment-as-feed — сама карточка ЕСТЬ коммент, поэтому вложенные — это
  // «ответы»/«ответ» (а не «комментарии»/«комментарий»), и ссылку «Посмотреть
  // все ответы» показываем всегда при наличии ответа (как в эталоне Figma).
  // Внутри comment-as-feed ответы рисуем в twitter-like (тот же ряд, что карточка).
  const asReplies = p.type === 'comment-as-feed';
  // Времени на отдельный ответ в данных нет — в twitter-like берём из TIMES
  // (разное на каждый ответ), в том же формате, что и «· время» у caf__head.
  const items = list.map((c, j) => commentItem(c.authorId, c.text, {
    tw: asReplies,
    time: asReplies ? TIMES[(j + 1) % TIMES.length] : '',
  })).join('\n');
  const moreLabel = asReplies ? 'Посмотреть все ответы' : 'Посмотреть все комментарии';
  const placeholder = asReplies ? 'Написать ответ…' : 'Написать комментарий…';
  // «Посмотреть …» — в обычной ленте показываем, только если у поста всего
  // больше 2 комментов (счётчик из actions-bar, поле comments — не число
  // отрисованных в fc-list); для comment-as-feed (ответы) — всегда.
  const showMore = asReplies || Number(p.comments) > 2;
  const more = showMore
    ? `\n            <div class="fc-more${asReplies ? ' __twitter-like' : ''}">\n              <span class="button-inline-wrapper __size-20 __view-primary"><button class="button-inline __size-20"><span class="button-inline__content">${esc(moreLabel)}</span></button></span>\n            </div>`
    : '';
  // Поле ответа: ава 44 + поле size-44 (радиус = высота/4) + иконка send справа.
  const input = `          <div class="fc-input">
            <div class="avatar __size-44 __type-image">${img(personPhoto('my_profile'))}</div>
            <div class="fc-input__field">
              <input class="fc-input__text" placeholder="${esc(placeholder)}">
              <button class="fc-input__send" aria-label="Отправить"><span class="icon __size-24 __slot-send"></span></button>
            </div>
          </div>`;
  const listClass = asReplies ? 'fc-list __twitter-like' : 'fc-list';
  return `          <div class="${listClass}">\n${items}${more}\n          </div>\n${input}`;
}

/** Прицепить комменты к готовой карточке: вставка перед последним </article>
 *  (карточки-острова). Клип с комментами рисуется как island (см. case 'clip'),
 *  так что отдельная обработка full-bleed не нужна. Без комментов — как есть. */
function attachComments(card, p) {
  // comment-as-feed сам встраивает ветку ответов внутрь .caf__stack (см. case).
  if (p.type === 'comment-as-feed') return card;
  const block = renderCommentThread(p);
  if (!block) return card;
  const i = card.lastIndexOf('</article>');
  if (i < 0) return card;
  return `${card.slice(0, i)}${block}\n        ${card.slice(i)}`;
}

/* ── рендер одного поста ──────────────────────────────────────────────────────
 * opts.authorHeader — необязательная замена authorHeader(id, time, {subscribe}).
 *   Нужна профильному пайплайну (scripts/fetch-profile.mjs): автор поста = хозяин
 *   профиля (data-pr-* / data-pr-subject-*), а НЕ человек из people.json. Если
 *   не передана — используется обычная запекаемая шапка из people.json. */
function renderPost(p, idx, opts = {}) {
  const { id, type, author, photos, likes, comments, reshares, link } = p;
  const authorHeaderFn = opts.authorHeader || authorHeader;
  const title = nbsp(resolveNames(p.title));   // «<id>_name» → имя; +неразрывные пробелы
  const text = nbsp(resolveNames(p.text));
  const ids = splitIds(author);
  const aid = ids[0];
  const time = TIMES[idx % TIMES.length];
  const x = EXTRAS[id] || {};

  switch (type) {
    /* ── базовый feed-text: text / photo / photo-gallery / video / group-post ── */
    case 'text': case 'photo': case 'photo-gallery': case 'video': case 'group-post': {
      const subscribe = isGroupId(aid); // group-post → «Подписаться» в шапке
      // Крошки «тема / рубрика» (если заданы в листе) — над шапкой автора,
      // как в NV-ленте. Шапку заворачиваем в feed-header (тот же паттерн, что
      // в комментах-как-фид), иначе оставляем uni-cell как есть.
      // В Трибуне — компактная шапка: иконка 20 + имя + «Подписаться» 28.
      const crumbs = breadcrumbs(p.tema, p.rubrika);
      const header = IS_TRIBUNE
        ? authorHeaderTribune(aid)
        : crumbs
          ? `          <header class="feed-header">
${crumbs}
${authorHeaderFn(aid, time, { subscribe })}
          </header>`
          : authorHeaderFn(aid, time, { subscribe });
      // Заголовок из колонки «заголовок» (если задан) — ds-title-l,
      // 4px до текста (заголовок+текст в одной группе, см. text-feed.css).
      const body = title
        ? `          <div class="text-feed__titled">
            <h2 class="text-feed__title ds-title-l">${esc(title)}</h2>
${feedText(text)}
          </div>`
        : feedText(text);
      return `        <article class="text-feed island">
${activityLine(p.header)}${header}

${body}
${media(photos)}
${actionsBar(likes, comments, reshares)}${marathonBlock(p.marathon, isJoined(p.marathonJoined))}
        </article>`.replace(/\n\n+/g, '\n\n');
    }

    /* ── Фотомарафон «от приложения» — отдельный фид: заголовок + веер фото + промо.
       Пост от ЧЕЛОВЕКА с фото делается типом `photo`: колонка «марафон» добавит
       к нему промо-блок (текст + кол-во участников + кнопка) через marathonBlock. ── */
    case 'marathon': {
      const hashtag = marathonHashtag(p.marathon);
      const rot = ['-12.42deg', '-4.17deg', '6.62deg'];
      const tiles = photos.slice(0, 3).map((u, i) =>
        `            <div class="marathon__tile" style="--marathon-tile-rotate:${rot[i] || '0deg'}">${img(u)}</div>`).join('\n');
      return `        <article class="marathon island">
          <p class="ds-title-l marathon__title">${esc(title)}</p>
          <div class="marathon__gallery">
${tiles}
          </div>
          <div class="marathon__special">
${marathonPromo(hashtag, isJoined(p.marathonJoined))}
            <div class="marathon__cta">
              <div class="button-wrapper __size-36 __full-width" style="display:block">
                <button class="button-container __style-primary" style="width:100%" data-href="marathon.html"><span class="button-content">Перейти к фотомарафону</span></button>
              </div>
              <div class="button-wrapper __size-36"><button class="button-container __style-secondary" aria-label="Ещё"><span class="button-content">${llIcon('more_16_20.svg')}</span></button></div>
            </div>
          </div>
        </article>`;
    }

    /* ── реклама (feed-ad — как в NV, но в Q3-разметке text-feed) ── */
    case 'ad': {
      const subtitle = PEOPLE[String(aid)]?.subtitle || 'Реклама 0+';
      return `        <article class="text-feed island ll-ad">
          <div class="uni-cell-wrapper"><div class="uni-cell-container"><div class="uni-cell">
            <div class="avatar __size-44 __type-image">${img(personPhoto(aid))}</div>
            <div class="uni-cell-additional-content">
              <div class="ds-title-s">${esc(personName(aid))}</div>
              <div class="ds-caption-s text-feed__time">${esc(subtitle)}</div>
            </div>
          </div></div></div>

${feedText(text)}
${media(photos)}
          <div class="actions-bar">
            <div class="button-wrapper __size-36 __full-width" style="display:block">
              <button class="button-container __style-primary" style="width:100%"><span class="button-content">Перейти</span></button>
            </div>
          </div>
        </article>`;
    }

    /* ── Возможно, вы знакомы — горизонтальный ряд vvz-card + help-карточка ──
       Карточки — из колонки «автор» (id персон). Подзаголовок «N общих друзей»
       берём из people.json (поле subtitle, лист «Люди»); если пусто — фолбэк.
       Заголовок портлета — из колонки «заголовок» (иначе дефолт). */
    case 'vvz-portlet': {
      const vvzTitle = title || 'Возможно, вы знакомы';
      const cards = ids.map((pid, i) => {
        const sub = (PEOPLE[String(pid)] && PEOPLE[String(pid)].subtitle) || VVZ_SUBTITLES[i] || 'Общие друзья';
        return `
            <div class="vvz-card __default" data-dismiss-target>
              <div class="vvz-card__media">
                <div class="vvz-card__blur" data-person-bg="${esc(pid)}"></div>
                <img data-person-avatar="${esc(pid)}" alt="">
                <span class="vvz-card__close button-circle-wrapper __size-24 __style-on-image"><button class="button-circle" aria-label="Скрыть" data-dismiss><span class="icon __size-16 __slot-close"></span></button></span>
              </div>
              <div class="vvz-card__content">
                <div class="vvz-card__title ds-title-s" data-person-name="${esc(pid)}"></div>
                <div class="vvz-card__subtitle ds-caption-m">${esc(sub)}</div>
                <div class="vvz-card__btn button-wrapper __size-36 __full-width">
                  <button class="button-container __style-primary"><span class="button-content">Дружить</span></button>
                </div>
              </div>
            </div>`;
      }).join('\n');
      return `        <section class="vvz-portlet island" data-dismiss-row aria-label="${esc(vvzTitle)}">
          <header class="vvz-portlet__header">
            <div class="vvz-portlet__title ds-title-l">${esc(vvzTitle)}</div>
            <span class="button-inline-wrapper __size-24 __view-primary"><button class="button-inline __size-24" data-href="vvz.html"><span class="button-inline__content">Ещё</span></button></span>
          </header>
          <div class="vvz-portlet__row">
${cards}

            <!-- Финальная карточка стека: «Найдите ещё больше друзей» -->
            <div class="vvz-card __help">
              <div class="vvz-card__help-top">
                <div class="vvz-card__help-icon">${llIcon('smile_24.svg', 'll-icon', 24)}</div>
                <div class="vvz-card__help-text">
                  <div class="vvz-card__help-title ds-title-s">Найдите ещё больше друзей</div>
                  <div class="vvz-card__help-subtitle ds-caption-m">Вы можете найти ещё больше друзей или одноклассников</div>
                </div>
              </div>
              <div class="vvz-card__help-links">
                <button type="button" class="vvz-card__help-link ds-caption-m">Поиск по контактам</button>
                <button type="button" class="vvz-card__help-link ds-caption-m">Поиск по школам</button>
              </div>
            </div>

          </div>
        </section>`;
    }

    /* ── На этот день — карточка-воспоминание (только вы видите) ── */
    case 'on-this-day': {
      const likesView = x.likes;
      const likesBlock = likesView ? `
          <div class="ll-otd__likes">
${avatarsStack(likesView.avatars)}
            </div>
            <span class="ds-body-m ll-otd__likes-text">${esc(likesView.text)}</span>
          </div>` : '';
      const mediaBlock = photos[0] ? `
            <div class="text-feed__reshare-card-media" style="aspect-ratio: 328/240">
              ${img(photos[0])}
            </div>` : '';
      return `        <article class="text-feed island">
          <div class="ll-otd__caption ds-body-m">
            ${EYE_SVG}
            <span>Видите только вы</span>
          </div>
          <div class="ds-title-l">${esc(title)}</div>

          <div class="text-feed__reshare-card">
            <div class="text-feed__reshare-card-author">
              <div class="avatar __size-24 __type-image">${img(personPhoto(aid))}</div>
              <div class="ds-body-m text-feed__reshare-card-author-name">Вы</div>
            </div>

            <p class="ds-body-m text-feed__body">${esc(text)}</p>${mediaBlock}
          </div>
${likesBlock}

          <div class="actions-bar">
            <div class="button-wrapper __size-36 __full-width">
              <button class="button-container __style-primary"><span class="button-content">
                Поделиться
              </span></button>
            </div>
            <div class="button-wrapper __size-36 __pinned-end">
              <button class="button-container __style-secondary" aria-label="Ещё"><span class="button-content">
                ${llIcon('more_16_20.svg')}
              </span></button>
            </div>
          </div>
        </article>`;
    }

    /* ── Репост-фид: автор шапки + вложенная карточка (бордер) ── */
    case 'reshare-post': {
      const inner = RESHARE_INNER_AUTHOR;
      const mediaBlock = photos[0] ? `
            <div class="text-feed__reshare-card-media" style="aspect-ratio: 4/3">
              ${img(photos[0])}
            </div>` : '';
      return `        <article class="text-feed island">
${activityLine(p.header)}${authorHeaderFn(aid, time)}

          <div class="text-feed__reshare-card">
            <div class="text-feed__reshare-card-author">
              <div class="avatar __size-24 __type-image">${img(personPhoto(inner))}</div>
              <div class="ds-body-m text-feed__reshare-card-author-name">${esc(personName(inner))}</div>
            </div>

${feedText(text)}${mediaBlock}
          </div>
${actionsBar(likes, comments, reshares)}
        </article>`.replace(/\n\n+/g, '\n\n');
    }

    /* ── Added Friend — добавил в друзья (встроенная friend-row) ── */
    case 'added-friend': {
      const friendId = ids[1] || ids[0];
      const f = x.friend || {};
      const verified = f.verified ? `
                  ${VERIFIED_SVG}` : '';
      const mutuals = (f.mutuals && f.mutuals.length) ? `
${avatarsStack(f.mutuals, 'll-friend-row__mutuals')}
                </div>` : '';
      return `        <article class="text-feed island">
${authorHeaderFn(aid, time)}

          <p class="ds-body-m text-feed__body">Добавил в друзья</p>

          <div class="text-feed__reshare-card">
            <div class="ll-friend-row">
              <div class="avatar __size-96 __type-image">${img(personPhoto(friendId))}</div>
              <div class="ll-friend-row__txt">
                <div class="ds-body-l ll-friend-row__name">
                  ${esc(personName(friendId))}${verified}
                </div>
                <div class="ds-body-m ll-friend-row__subtitle">${esc(f.subtitle || '20 общих друзей')}</div>${mutuals}
              </div>
            </div>
          </div>

          <div class="actions-bar">
            <label class="button-wrapper __size-36 ll-add-friend">
              <input type="checkbox" hidden>
              <span class="button-container __style-secondary"><span class="button-content">
                ${llIcon('add_16_20.svg', 'll-icon ll-add-friend__icon-add')}
                <svg class="ll-icon ll-add-friend__icon-done" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M5 10.5 L8.5 14 L15 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="ll-add-friend__label-add">Добавить в друзья</span><span class="ll-add-friend__label-added">У вас в друзьях</span>
              </span></span>
            </label>
            <div class="button-wrapper __size-36 __pinned-end">
              <button class="button-container __style-secondary" aria-label="Ещё"><span class="button-content">
                ${llIcon('more_16_20.svg')}
              </span></button>
            </div>
          </div>
        </article>`;
    }

    /* ── Shared Link — пост со ссылкой и превью ── */
    case 'shared-link': {
      const domain = linkDomain(link);
      const href = link || '#';
      // Заголовок/описание превью из таблицы. В колонке «описание» допускаем
      // «Заголовок / Подзаголовок» — делим по первому « / ». Отдельная колонка
      // «заголовок», если заполнена, перебивает заголовок из слеша.
      // Приоритет: таблица → авто-мета со страницы → companion-заглушка → домен.
      let mTitle = title, mDesc = (p.desc || '').trim();
      const slash = mDesc.indexOf(' / ');
      if (slash !== -1) {
        if (!mTitle) mTitle = mDesc.slice(0, slash).trim();
        mDesc = mDesc.slice(slash + 3).trim();
      }
      const linkTitle = mTitle || p.linkMeta?.title || x.title || domain;
      const linkDescr = mDesc || p.linkMeta?.description || x.description || '';
      const preview = photos[0]
        ? `            <div class="text-feed__reshare-card-media" style="aspect-ratio: 328/164">${img(photos[0])}</div>`
        : `            <div class="text-feed__reshare-card-media" style="aspect-ratio: 328/164; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)"></div>`;
      return `        <article class="text-feed island">
${authorHeaderFn(aid, time)}

${feedText(text)}

          <a class="text-feed__reshare-card" href="${esc(href)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
${preview}
            <div class="text-feed__link">
              <div class="ds-title-m">${esc(linkTitle)}</div>
              <div class="ds-body-m">${esc(linkDescr)}</div>
              <div class="ds-caption-m">${esc(domain)}</div>
            </div>
          </a>
${actionsBar(likes, comments, reshares)}
        </article>`;
    }

    /* ── Подарок/открытка — получил … от … ── */
    /* gift-received — обычный подарок/открытка; ai-gift-received — ИИ-подарок
       (кнопка __style-ai-gift + тёплая подложка #FFEFE5 бордерного блока).
       Разметка общая, отличается кнопкой/иконкой/подложкой. */
    case 'gift-received': case 'ai-gift-received': {
      const isAi = type === 'ai-gift-received';
      const caption = title || (isAi ? 'Создал ИИ-подарок для' : 'Получил подарок от');
      const giverId = ids[1] || ids[0];
      // По умолчанию (обычный подарок/открытка) — модификатор __gift с тёплой
      // подложкой #FFEFE5 (как у ИИ-подарка). ИИ-подарок ниже ставит __ai-gift.
      // Обычный подарок/открытка — праймари-кнопка. Иконка подарка слева
      // только у открытки; у обычного подарка кнопка без иконки.
      let cta, icon = '', btnStyle = '__style-primary', cardMod = ' __gift';
      if (isAi) {
        cta = 'Создать подарок из фото';
        btnStyle = '__style-ai-gift';
        cardMod = ' __ai-gift';   // тёплая подложка #FFEFE5 у бордерного блока
        icon = llIcon('sparkles_16_20.svg');
      } else if (/подар/i.test(caption)) {
        cta = 'Сделать подарок';
        icon = '';   // обычный подарок — кнопка без иконки слева
      } else {
        cta = 'Сделать открытку';
        icon = llIcon('gift_16_20.svg');
      }
      const mediaBlock = photos[0] ? `
            <div class="text-feed__reshare-card-media" style="aspect-ratio: 1">
              ${img(photos[0])}
            </div>` : '';
      return `        <article class="text-feed island">
${authorHeaderFn(aid, time)}

          <div class="text-feed__reshare-card${cardMod}">
            <div class="ll-gift-from">
              <div class="ds-body-m">${esc(caption)}</div>
              <div class="text-feed__reshare-card-author">
                <div class="avatar __size-24 __type-image">${img(personPhoto(giverId))}</div>
                <div class="ds-body-m text-feed__reshare-card-author-name"><b class="ds-title-s">${esc(personName(giverId))}</b></div>
              </div>
            </div>${mediaBlock}
          </div>

          <div class="actions-bar">
            <div class="button-wrapper __size-36 __full-width">
              <button class="button-container ${btnStyle}"><span class="button-content">${icon}${cta}</span></button>
            </div>
          </div>
${actionsBar(likes, comments, reshares)}
        </article>`;
    }

    /* ── Годовщина дружбы — спец-класс feed-birthday ── */
    case 'friendversary': {
      const a1 = personPhoto(ids[0]) || 'https://i.pravatar.cc/288?img=49';
      const a2 = personPhoto(ids[1]) || 'https://i.pravatar.cc/288?img=23';
      // Получатель подарка — друг (id, отличный от my_profile). Кол-во лет —
      // первое число из текста («Ровно 3 года назад…»). Прокидываем на
      // страницу подарков: ?to=<id>&anniv=<лет> → там показывается ряд
      // «аватар + ФИ + разделитель» и заголовок «N года дружбы».
      const giftTo = ids.find(id => id && id !== 'my_profile') || ids[1] || ids[0] || '';
      const giftYears = (String(text).match(/(\d+)/) || [])[1] || '';
      const giftHref = 'gifts-catalog.html?to=' + encodeURIComponent(giftTo) +
        (giftYears ? '&anniv=' + giftYears : '');
      // Подзаголовок: «Ровно N <год/года/лет> назад вы добавили\n<Имя друга> в
      // друзья OK». Число и грамматику единицы берём из текста листа (там уже
      // «3 года»), имя друга — из автора, принудительный перенос перед именем.
      const annivUnit = (String(text).match(/\d+\s+(год[а-яё]*|лет)/i) || [])[1] || 'года';
      const annivName = firstName(giftTo) || 'друга';
      const annivText = `Ровно ${giftYears || '3'} ${annivUnit} назад вы добавили\n${annivName} в друзья OK`;
      return `        <article class="feed-birthday island">
          <div class="feed-birthday__deco"></div>

          <div class="feed-birthday__avatars">
            <div class="avatar __size-120 __type-image __border">${img(a1)}</div>
            <div class="avatar __size-120 __type-image __border">${img(a2)}</div>
          </div>

          <div class="ds-title-l feed-birthday__title">${annivProse(title)}</div>
          <div class="ds-body-m feed-birthday__text">${annivProse(annivText)}</div>

          <div class="actions-bar">
            <div class="button-wrapper __size-36 __full-width">
              <button class="button-container __style-primary" data-href="${giftHref}"><span class="button-content">Поздравить друга</span></button>
            </div>
            <div class="button-wrapper __size-36 __pinned-end"><button class="button-container __style-secondary" aria-label="Ещё"><span class="button-content"><span class="icon __size-20 __src feed-birthday__icon-more"></span></span></button></div>
          </div>
        </article>`;
    }

    /* ── Вас отметили на фото — full-bleed media + tooltip ── */
    case 'tagged-photo': {
      const tag = x.tag || { name: 'Анастасия Кащеева' };
      return `        <article class="text-feed island">
          <div class="ll-otd__caption ds-body-m">
            ${EYE_SVG}
            <span>Видите только вы</span>
          </div>
          <div class="ds-title-l">${esc(title)}</div>

          <div class="text-feed__media ll-tagged__media">
            ${img(photos[0] || '')}
            <div class="tooltip-wrapper __view-primary __side-top __alignment-center __placement-top-center"
                 style="position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%)">
              <div class="tooltip ds-title-m">${esc(personName(aid) || tag.name)}</div>
              <div class="tooltip-tail"></div>
            </div>
          </div>

          <div class="actions-bar">
            <div class="button-wrapper __size-36 __full-width">
              <button class="button-container __style-primary"><span class="button-content">
                Поделиться
              </span></button>
            </div>
          </div>
        </article>`;
    }

    /* ── Клип — full-bleed 9:16 с тёмными actions-overlay ── */
    case 'clip': {
      // Видео клипа. В листе («фото») можно дать:
      //   • полный URL (http…) — берём как есть;
      //   • имя файла с расширением (hermitage.mp4) или БЕЗ (hermitage) —
      //     подставляем assets/clips/<имя>, при отсутствии расширения добавляем .mp4;
      //   • относительный путь (со слешем) — берём как есть;
      //   • пусто — дефолтный клип из COMPANION (assets/clips/sable-tepa.mp4).
      const rawClip = photos[0] || (p.photosRaw && p.photosRaw[0]) || '';
      let src;
      if (/^https?:\/\//.test(rawClip)) {
        src = rawClip;
      } else if (rawClip) {
        // имя без видео-расширения → дополняем .mp4 (ты вписала «hermitage»)
        let f = /\.(mp4|webm|mov)(\?|#|$)/i.test(rawClip) ? rawClip : rawClip + '.mp4';
        src = f.includes('/') ? f : `assets/clips/${f}`;
      } else {
        src = x.fallbackMedia;
      }
      const visual = /\.(mp4|webm|mov)(\?|#|$)/i.test(src)
        ? `<video src="${esc(src)}" autoplay muted loop playsinline></video>`
        : img(src);
      // Тап по клипу открывает полноэкранный плеер klipy.html (как в main):
      // ссылка-оверлей над media (z1), но под шапкой/mute/actions (z2).
      // Прокидываем аватар/имя/счётчики — klipy.html подставляет их в шапку
      // и actions плеера (data-author-ava / data-like-count / data-reshare-count).
      const q = new URLSearchParams({
        type: 'video', src, name: personName(aid), from: 'lenta-q3.html',
        ava: personPhoto(aid), like: String(likes || 0), reshare: String(reshares || 0),
      });
      const openUrl = `klipy.html?${q}`;

      // Шапка клипа (оверлей на видео): кнопка «Подписаться» (для сообществ) — на
      // ОДНОЙ строке с именем (feed-header__line), время — строкой ниже. Имя тянется
      // (feed-header__name), кнопка центрируется по строке имени (эталон Figma 4833-29163).
      const clipBtn = `<label class="button-wrapper __size-28 button-subscribe clip-feed__subscribe"><input type="checkbox" hidden><span class="button-container __style-primary-on-color"><span class="button-content"><span class="button-subscribe__label-default">Подписаться</span><span class="button-subscribe__label-subscribed">Подписан</span></span></span></label>`;
      const clipName = isGroupId(aid)
        ? `<div class="feed-header__line"><div class="ds-title-s feed-header__name">${esc(personName(aid))}</div>${clipBtn}</div>`
        : `<div class="ds-title-s">${esc(personName(aid))}</div>`;

      // Клип С комментами: ТОТ ЖЕ full-bleed клип (видео 9:16 + оверлей автора +
      // mute), но actions-bar и ветка комментов крепятся НИЖЕ на белом (эталон
      // «Комменты Клип»). Плеер заворачиваем в island-карточку; comment-thread
      // добавит attachComments перед </article>. Actions-overlay на видео НЕТ —
      // счётчики уходят в белый actions-bar под клипом.
      if ((p.threadComments || []).length) {
        const hint = p.header
          ? `          <div class="ds-title-s ll-clipc__hint">${esc(p.header)}</div>\n`
          : '';
        return `        <article class="text-feed island ll-clipc">
${hint}          <div class="clip-feed ll-clipc__player">
            <div class="clip-feed__media">${visual}</div>
            <a class="clip-feed__open" aria-label="Открыть клип" href="${esc(openUrl)}" style="position:absolute;inset:0;z-index:1"></a>
            <div class="clip-feed__header">
              <div class="avatar __size-44 __type-image">${img(personPhoto(aid))}</div>
              <div class="clip-feed__txt">
                ${clipName}
                <div class="ds-caption-s clip-feed__time">${esc(time)}</div>
              </div>
            </div>
            <button class="clip-feed__mute" aria-label="Включить звук"><img class="clip-feed__mute-icon" src="assets/icons/sound_off_24.svg" width="24" height="24" alt=""></button>
          </div>
${actionsBar(likes, comments, reshares)}
        </article>`;
      }

      return `        <article class="clip-feed">
          <div class="clip-feed__media">${visual}</div>

          <!-- Тап по клипу открывает полноэкранный плеер. Над media (z0), но под
               оверлеями шапки/mute/actions (z2) — кнопки кликаются как обычно. -->
          <a class="clip-feed__open" aria-label="Открыть клип"
             href="${esc(openUrl)}"
             style="position:absolute;inset:0;z-index:1"></a>

          <div class="clip-feed__header">
            <div class="avatar __size-44 __type-image">${img(personPhoto(aid))}</div>
            <div class="clip-feed__txt">
              ${clipName}
              <div class="ds-caption-s clip-feed__time">${esc(time)}</div>
            </div>
          </div>

          <button class="clip-feed__mute" aria-label="Включить звук"><img class="clip-feed__mute-icon" src="assets/icons/sound_off_24.svg" width="32" height="32" alt=""></button>

          <div class="actions-bar clip-feed__actions">
${countBtn('comment_16_20.svg', comments, { style: 'on-image' })}
${countBtn('reshare_16_20.svg', reshares, { style: 'on-image' })}
${klassBtn(likes, { style: 'on-image' })}
${moreBtn({ style: 'on-image' })}
          </div>
        </article>`;
    }

    /* ── Клип из воспоминаний — island c full-bleed клипом + оверлеи ──
       Шапка «Видите только вы» + крупный заголовок, ниже медиа (фото-монтаж)
       с подписью-периодом и actions-overlay (Поделиться + «···») прямо на клипе.
       Звука нет — mute-кнопки нет. */
    case 'memories-clip': {
      // Кадры клипа: несколько фото из листа сменяют друг друга кросс-фейдом
      // (см. JS внизу lenta-q3.html). Если фото нет — companion-подборка.
      // Единственный видеофайл показываем как <video> (без слайд-шоу).
      const pics = photos.length ? photos : (x.fallbackPhotos || []);
      const label = text || x.label || 'Лето 2026';
      const isVideo = pics.length === 1 && /\.(mp4|webm|mov)(\?|#|$)/i.test(pics[0]);
      // Эффекты перехода кадр→кадр (Ken Burns): по кругу, чтобы соседние различались.
      const MCLIP_FX = ['__fx-zoom-in', '__fx-zoom-out', '__fx-pan-left', '__fx-blur-in'];
      const mediaInner = isVideo
        ? `            <video src="${esc(pics[0])}" autoplay muted loop playsinline></video>`
        : pics.map((u, i) =>
            `            ${img(u, `class="ll-memclip__slide ${MCLIP_FX[i % MCLIP_FX.length]}${i === 0 ? ' __active' : ''}" `)}`).join('\n');
      // data-clip-edit: тап по медиа (и по «Поделиться») открывает превью/редактор.
      return `        <article class="text-feed island ll-memclip">
          <div class="ll-otd__caption ds-body-m">
            ${EYE_SVG}
            <span>Видите только вы</span>
          </div>
          <div class="ds-title-l">${esc(title || 'Ваш клип из воспоминаний')}</div>

          <div class="text-feed__media ll-memclip__media" data-clip-edit data-clip-label="${esc(label)}">
${mediaInner}
            <div class="ll-memclip__label ll-memclip__label--ok ds-title-l">${esc(label)}</div>
            <div class="actions-bar ll-memclip__actions">
              <div class="button-wrapper __size-36 __full-width">
                <button class="button-container __style-primary"><span class="button-content">
                  Поделиться
                </span></button>
              </div>
              <div class="button-wrapper __size-36 __pinned-end ll-memclip__more">
                <button class="button-container __style-primary-on-color" aria-label="Ещё"><span class="button-content">
                  ${llIcon('more_16_20.svg')}
                </span></button>
              </div>
            </div>
          </div>
        </article>`;
    }

    /* ── comment-as-feed: коммент как отдельная карточка ленты (twitter-like) ──
       Двухколоночный «твиттер-ряд» (.caf.__twitter-like): слева ава 44 +
       вертикальная «палка»-трунк, справа — имя · дата → текст коммента (body-m)
       → превью оригинала (reshare-card с автором, который шёл вторым в авторах)
       → 3 инлайн-счётчика (комменты · репосты · классы). Ответы (ветку) добавит
       attachComments — тоже в twitter-like (fc-comment.__twitter-like), трунк
       проходит сквозь весь стек. Авторы: ids[0] — комментатор, ids[1] — автор
       оригинала (в превью). */
    case 'comment-as-feed': {
      const commenter = aid;          // ids[0] — автор коммента (ава 44 + имя)
      const to = ids[1];              // ids[1] — автор оригинала (в карточке-превью)
      // «Палку» вниз рисуем только если есть ответы, иначе линия повиснет.
      const hasReplies = (p.threadComments || []).length > 0;
      const line = hasReplies ? `
              <span class="caf__line" aria-hidden="true"></span>` : '';
      // Превью оригинала: автор (ава 24 + имя) + текст оригинала (его заголовок).
      const orig = text || nbsp(resolveNames(p.desc)) || '';
      const previewAuthor = to ? `
              <div class="text-feed__reshare-card-author">
                <div class="avatar __size-24 __type-image">${img(personPhoto(to))}</div>
                <div class="ds-body-m text-feed__reshare-card-author-name">${esc(personName(to))}</div>
              </div>` : '';
      const previewBody = orig ? `
              <p class="ds-body-m text-feed__body">${esc(orig)}</p>` : '';
      // Фото оригинала (если есть ссылка) — медиа reshare-card, отступ до него 12
      // даёт сам компонент (.text-feed__reshare-card-media:not(:first-child)).
      // img абсолютом внутри бокса: высоту держит aspect-ratio 16/9 контейнера
      // (position:relative из базы), а картинка заполняет его cover'ом. Через
      // height:100% в потоке загруженная img диктовала бы свой нативный ratio.
      const previewMedia = photos.length ? `
              <div class="text-feed__reshare-card-media" style="aspect-ratio: 16 / 9">${img(photos[0], 'style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block" ')}</div>` : '';
      const preview = (to || orig || previewMedia) ? `            <div class="text-feed__reshare-card">${previewAuthor}${previewBody}${previewMedia}
            </div>` : '';
      // Хлебные крошки (тема/рубрика) над комментом — отдельным .caf__crumbs,
      // сиблингом перед .caf__stack (отступ до ряда даёт padding самих крошек 4).
      const cafCrumbs = breadcrumbs(p.tema, p.rubrika, 'caf__crumbs');
      const crumbs = cafCrumbs ? '\n' + cafCrumbs : '';
      // Всё содержимое (ряд-коммент + ветка ответов + поле) — в одном контейнере
      // .caf__stack (padding 0, gap 8). Ветку рисуем тут же (attachComments для
      // comment-as-feed ничего не добавляет — см. его guard).
      return `        <article class="caf __twitter-like island">${crumbs}
          <div class="caf__stack">
            <div class="caf__row">
              <div class="caf__aside">
                <div class="avatar __size-44 __type-image">${img(personPhoto(commenter))}</div>${line}
              </div>
              <div class="caf__content">
                <div class="caf__head">
                  <span class="ds-title-s caf__name">${esc(personName(commenter))}</span>
                  <span class="ds-body-m caf__date">· ${esc(time)}</span>
                </div>
${cafTextTw(title)}
${preview}
${cafActions(comments, reshares, likes)}
              </div>
            </div>
${renderCommentThread(p)}
          </div>
        </article>`;
    }

    default:
      console.warn(`  ⚠️  неизвестный тип «${type}» (${id}) — пропущен`);
      return '';
  }
}

/* ── splice в lenta-q3.html ─────────────────────────────────────────────────── */
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function splice(cardsHtml) {
  const file = resolve(ROOT, FEED.html);
  let html = readFileSync(file, 'utf8');
  const START = `<!-- FEED:START (генерится ${FEED.cmd} — не редактировать вручную) -->`;
  const END = '<!-- FEED:END -->';
  const block = `${START}\n${cardsHtml}\n        ${END}`;

  if (html.includes(START)) {
    html = html.replace(new RegExp(escRe(START) + '[\\s\\S]*?' + escRe(END)), block);
  } else {
    // Первая генерация: вырезаем legacy-карточки между баннером и закрытием .ll-feed.
    // Граница начала — комментарий первой карточки; конец — закрытие <div class="ll-feed">.
    const startIdx = html.indexOf('        <!-- 1. Короткий текст');
    const closeIdx = html.indexOf('\n      </div>\n    </div>');
    if (startIdx === -1 || closeIdx === -1)
      throw new Error(`Не нашёл маркеры FEED:START/END и границы legacy-карточек в ${FEED.html}`);
    html = html.slice(0, startIdx) + block + '\n\n' + html.slice(closeIdx + 1);
  }
  writeFileSync(file, html);
}

/* ── Таб-стрип ленты (только для фидов с FEED.tabs, напр. activity-lenta) ──────
   «Лента / Сегодня / Подарки / Обсуждение» — DS-компонент .tabs (components/tabs.css,
   типографика ds-title-xl). Прикрепляется к ВЕРХУ ПЕРВОГО поста, который НЕ ВВЗ
   (ВВЗ-портлет — полноширинный остров, табы на нём не сидят): вставляется первым
   ребёнком карточки-острова, сразу после её открывающего тега. Отступы: бока 16 /
   низ 8 даёт сам .tabs; верх 22 — класс .ll-feed-tabs (правило в самой странице).
   Пути today/gifts — без «../» (у activity-lenta есть <base href="../">). */
const FEED_TABS =
`          <div class="tabs ll-feed-tabs">
            <button class="tabs-tab ds-title-xl __state-on">Лента</button>
            <button class="tabs-tab ds-title-xl" data-href="today.html">Сегодня</button>
            <button class="tabs-tab ds-title-xl" data-href="gifts-catalog.html">Подарки</button>
            <button class="tabs-tab ds-title-xl">Обсуждение</button>
          </div>`;

function injectFeedTabs(cardsArr) {
  for (let i = 0; i < cardsArr.length; i++) {
    if (/vvz-portlet/.test(cardsArr[i])) continue;     // ВВЗ — пропускаем
    const injected = cardsArr[i].replace(
      /^(\s*<(?:article|section)\b[^>]*>\n)/,
      (m) => m + FEED_TABS + '\n');
    if (injected !== cardsArr[i]) { cardsArr[i] = injected; return cardsArr; }
  }
  console.warn('  ⚠️  таб-стрип не вставлен: не нашёл первого НЕ-ВВЗ поста-острова');
  return cardsArr;
}

/* ── main ───────────────────────────────────────────────────────────────────── */
async function main() {
  // --offline: реген из data/q3-feed.json без обращения к таблице.
  const offline = process.argv.includes('--offline');
  let posts;

  if (offline) {
    console.log(`→ Офлайн-реген из ${FEED.json} (таблицу не тяну)…`);
    posts = JSON.parse(readFileSync(resolve(ROOT, FEED.json), 'utf8')).posts || [];
  } else {
    console.log(`→ Тяну «${SHEET_NAME}» из таблицы…`);
    const res = await fetch(csvUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} — проверь доступ к таблице по ссылке.`);
    const rows = parseCsv(await res.text());
    const [header = [], ...body] = rows;

    // Колонки матчим ПО ИМЕНИ заголовка, а не по позиции — так столбцы можно
    // вставлять/двигать в таблице, не ломая парсинг (как раз случай «описание»
    // между «текст» и «фото»). Сравниваем по началу заголовка (учёт «фото (…)»).
    const head = header.map(h => String(h || '').trim().toLowerCase());
    const col = (...names) => {
      for (const n of names) {
        const i = head.findIndex(h => h === n || h.startsWith(n + ' '));
        if (i >= 0) return i;
      }
      return -1;
    };
    const I = {
      id: col('id'), type: col('тип'), author: col('автор'),
      tema: col('тема'), rubrika: col('рубрика'), header: col('шапка'),
      title: col('заголовок'), text: col('текст'), photos: col('фото'),
      likes: col('лайки'), comments: col('комменты'), reshares: col('репосты'),
      link: col('ссылка'), desc: col('описание'),
      marathon: col('марафон'), joined: col('участвую'),
      // Комменты под постом — до двух верхнеуровневых (автор + текст каждого).
      // Можно дополнить парами «автор/текст коммента N» — просто расширь список.
      c1Author: col('автор коммента 1'), c1Text: col('текст коммента 1'),
      c2Author: col('автор коммента 2'), c2Text: col('текст коммента 2'),
    };

    // Защита от чужой схемы: лист Q3 обязан иметь колонки «тип» и «автор». Если
    // их нет (например, gviz отдал не тот лист) — НЕ трогаем ленту, чтобы
    // деплой-реген не обнулил живой фид.
    if (I.type < 0 || I.author < 0) {
      throw new Error(
        `лист по gid=${SHEET_GID} не похож на «${SHEET_NAME}» (нет колонок «тип»/«автор»): ` +
        `${head.join(' | ')}. Лента НЕ перегенерирована — проверь доступ/лист в таблице.`);
    }

    const cell = (c, i) => (i >= 0 ? (c[i] || '').trim() : '');
    posts = [];
    // Идём строго по порядку строк. id в листе не обязателен: если пусто —
    // подставляем порядковый (row-N), чтобы строка не выпадала из ленты.
    let rowNum = 0;
    for (const c of body) {
      rowNum++;
      const type = cell(c, I.type);
      if (!type) continue;
      const id = cell(c, I.id) || `row-${rowNum}`;
      posts.push({
        id, type,
        author: cell(c, I.author),
        tema: cell(c, I.tema), rubrika: cell(c, I.rubrika),  // крошки (breadcrumbs)
        header: cell(c, I.header),   // напр. «может быть интересно» (лейбл над клипом)
        title: cell(c, I.title),
        text: cell(c, I.text),
        photos: cell(c, I.photos).split(',').map(s => s.trim()).filter(u => /^https?:\/\//.test(u)),
        // Сырые значения «фото» (без фильтра http) — для клипа можно дать просто
        // имя файла (hermitage.mp4), скрипт подставит assets/clips/<имя>.
        photosRaw: cell(c, I.photos).split(',').map(s => s.trim()).filter(Boolean),
        likes: cell(c, I.likes),
        comments: cell(c, I.comments),
        reshares: cell(c, I.reshares),
        link: cell(c, I.link),
        marathon: cell(c, I.marathon),
        marathonJoined: cell(c, I.joined),
        // shared-link: превью ссылки. В колонке «описание» можно писать
        // «Заголовок / Подзаголовок» (делится по « / » в renderPost). Заголовок
        // можно задать и отдельной колонкой «заголовок» — она перебивает слеш.
        desc: cell(c, I.desc),
        // Комменты под постом: пары «автор/текст». Берём только заполненные
        // (есть текст) — пустые пары не дают пустых карточек комментов.
        threadComments: [
          { authorId: cell(c, I.c1Author), text: cell(c, I.c1Text) },
          { authorId: cell(c, I.c2Author), text: cell(c, I.c2Text) },
        ].filter(x => x.text),
      });
    }

    // shared-link: если ни «заголовок», ни «описание» не вписаны вручную —
    // пробуем вытянуть og:-мету со страницы. Если текст уже есть в таблице —
    // фетч не нужен (не упираемся в блокировки сайтов вроде RBC).
    for (const p of posts) {
      if (p.type === 'shared-link' && p.link && !(p.title || p.desc)) {
        const meta = await fetchLinkMeta(p.link);
        if (meta) { p.linkMeta = meta; console.log(`  ↳ ${p.id}: «${meta.title}»`); }
        else console.warn(`  ⚠️  ${p.id}: мету ${p.link} прочитать не вышло — впиши «Заголовок / Подзаголовок» в колонку «описание» (или останется заглушка)`);
      }
    }

    // Кэшируем фото локально (только там, где задан mediaDir — Трибуна).
    // Подменяем URL в p.photos ДО записи json/рендера, чтобы и json, и HTML
    // ссылались на assets/<feed>/… . Внешние ссылки протухают — копия остаётся.
    if (FEED.mediaDir) {
      const cache = createMediaCache({
        root: ROOT, dirRel: FEED.mediaDir,
        manifestPath: resolve(ROOT, FEED.mediaManifest), dryRun: CHECK_ONLY,
      });
      for (const p of posts) {
        if (Array.isArray(p.photos) && p.photos.length)
          p.photos = await Promise.all(p.photos.map(u => cache.resolveUrl(u)));
      }
      cache.save();
      console.log('  ' + cache.report());
    }

    if (CHECK_ONLY) {
      console.log('(--check) Ссылки проверены, ничего не записано.');
      return;
    }

    writeFileSync(resolve(ROOT, FEED.json),
      JSON.stringify({ _readme: { 'источник': `Google-таблица, лист «${SHEET_NAME}» (gid ${SHEET_GID})`, 'как_обновить': `node ${FEED.cmd}  (офлайн-реген: node ${FEED.cmd} --offline)` }, posts }, null, 2) + '\n');
  }

  // Разложить компаньон-данные по актуальным id (привязка к ТИПУ карточки).
  for (const p of posts) if (COMPANION[p.type]) EXTRAS[p.id] = COMPANION[p.type];

  const rendered = posts
    .map((p, i) => { const card = renderPost(p, i); return card ? attachComments(card, p) : card; })
    .filter(Boolean);
  // Ещё один предохранитель: ни одной карточки не отрисовалось (все типы чужие)
  // — не вставляем пустоту в живую ленту.
  if (rendered.length === 0)
    throw new Error('не отрисовано ни одной карточки — лента НЕ тронута (проверь лист/типы).');
  if (FEED.tabs) injectFeedTabs(rendered);   // таб-стрип на первом НЕ-ВВЗ посте
  const cards = rendered.join('\n\n');
  splice(cards);

  console.log(`✓ ${posts.length} постов → ${FEED.json} + вставлено в ${FEED.html}`);
  posts.forEach(p => console.log(`  • ${p.id.padEnd(8)} ${p.type}`));
}

/* ── exports для переиспользования (scripts/fetch-profile.mjs) ────────────────
 * Импорт этого модуля НЕ должен ничего запускать — main() стартует только при
 * прямом запуске файла (см. guard ниже). Профильный пайплайн переиспользует
 * рендереры/хелперы и подменяет шапку автора через renderPost(p, i, {authorHeader}). */
export {
  renderPost, attachComments, renderCommentThread, commentItem,
  authorHeader, breadcrumbs, activityLine, feedText, media, actionsBar,
  esc, img, personName, personPhoto, resolveNames, splitIds, isGroupId,
  parseCsv, PEOPLE, TIMES, COMPANION, EXTRAS, SPREADSHEET_ID,
};

// Авто-запуск только при прямом вызове (node scripts/fetch-q3.mjs), не при import.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(err => { console.error('✗', err.message); process.exit(1); });
}
