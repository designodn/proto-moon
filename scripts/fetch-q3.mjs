#!/usr/bin/env node
/**
 * fetch-q3.mjs — собирает Q3-ленту (lenta-q3.html) из листа «Q3-посты» Google-таблицы.
 *
 *   node scripts/fetch-q3.mjs            — тянет лист и перегенерит ленту
 *   node scripts/fetch-q3.mjs --offline  — реген из data/q3-feed.json (без сети)
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
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SPREADSHEET_ID = '1Ctwjp2J0HSmvb6kL4NoDqaB9W4QfdAXXDnzyBDLYZ7Y';
const SHEET_NAME = 'Q3-посты';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const csvUrl =
  `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
  `?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;

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
  // tagged-photo: hero-аватар + имя на фото + координаты тултипа (как в эталоне)
  'tagged-photo': {
    heroAvatar: 'https://i.pravatar.cc/192?img=49',
    tag: { name: 'Анастасия Кащеева', top: 28, left: 56 },
  },
  // clip: локальное видео из репы (как clip-feed в NV-ленте), если в листе нет своего
  clip: { fallbackMedia: 'assets/clips/sable-tepa.mp4' },
};

// vvz-portlet: подзаголовок каждой карточки (по порядку id из колонки «автор»)
const VVZ_SUBTITLES = ['20 общих друзей', '12 общих друзей', '12 общих друзей', '10 общих друзей'];

// reshare-post: автор вложенной карточки (внутренняя шапка), если не задан иначе
const RESHARE_INNER_AUTHOR = 8;

// Заполняется в main(): EXTRAS[post.id] = COMPANION[post.type] (привязка к типу).
const EXTRAS = {};

/* Дефолтное время поста (время — «реквизит» шаблона, в листе его нет). */
const TIMES = ['9:12', '12:48', 'вчера, 18:02', 'пн, 12:03', '10:05', '8:42', 'вчера, 21:10', '14:02', '11:18', '7:30', '20:10', 'вт, 9:33', '17:46', '12:48', '15:20', '12:48'];

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
const splitIds = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

/* ── helpers разметки ───────────────────────────────────────────────────────── */
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const img = (url, attr = '') => `<img ${attr}src="${esc(url)}" alt="">`;

/** Шапка автора (uni-cell): аватар __size-44, имя ds-title-s, время text-feed__time.
 *  Имя и URL аватара запекаются inline из people.json. Для group-* добавляем
 *  кнопку «Подписаться» (button-subscribe), как в эталонной карточке 4. */
function authorHeader(id, time, { subscribe = false } = {}) {
  const sub = subscribe ? `
            <label class="button-wrapper __size-28 button-subscribe">
              <input type="checkbox" hidden>
              <span class="button-container __style-secondary"><span class="button-content"><span class="button-subscribe__label-default">Подписаться</span><span class="button-subscribe__label-subscribed">Подписан</span></span></span>
            </label>` : '';
  return `          <div class="uni-cell-wrapper"><div class="uni-cell-container"><div class="uni-cell">
            <div class="avatar __size-44 __type-image">${img(personPhoto(id))}</div>
            <div class="uni-cell-additional-content">
              <div class="ds-title-s">${esc(personName(id))}</div>
              <div class="ds-caption-s text-feed__time">${esc(time)}</div>
            </div>${sub}
          </div></div></div>`;
}

/** Текстовый блок поста: длинный (> CLAMP симв.) → сворачиваемый toggle, иначе
 *  простой <p>. bodyClass — класс параграфа (text-feed__body по умолчанию). */
const CLAMP = 160;
function feedText(text, { bodyClass = 'ds-body-m text-feed__body' } = {}) {
  if (!text) return '';
  if (text.length <= CLAMP) {
    return `          <p class="${bodyClass}">${esc(text)}</p>`;
  }
  // Делим по границе слова возле CLAMP: голова — видна, хвост — под «ещё».
  let cut = text.lastIndexOf(' ', CLAMP);
  if (cut < CLAMP * 0.5) cut = CLAMP;
  const head = text.slice(0, cut);
  const tail = text.slice(cut); // начинается с пробела — отступ перед хвостом сохраняется
  return `          <label class="text-feed__body-toggle">
            <input type="checkbox" hidden>
            <p class="${bodyClass}">
              ${esc(head)}<span class="text-feed__body-full">${esc(tail)}</span><span class="text-feed__more"><span class="text-feed__more-show"> ещё</span><span class="text-feed__more-hide"> скрыть</span></span>
            </p>
          </label>`;
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
    const more = (i === 3 && photos.length > 4) ? ` __more" data-more="${photos.length - 3}` : '"';
    return `            <div class="media__cell${more}>${img(u)}</div>`;
  }).join('\n');
  return `          <div class="text-feed__media media __type-gallery">
${cells}
          </div>`;
}

/** Иконка экшена (NV-пак лежит в assets/icons, путь без «../»). */
const llIcon = (file, cls = 'll-icon', w = 20) =>
  `<img class="${cls}" src="assets/icons/${file}" width="${w}" height="${w}" alt="">`;

/** Кнопка-счётчик (comment / reshare). Пустой счётчик → 0. */
function countBtn(file, n, { style = 'secondary' } = {}) {
  return `            <div class="button-wrapper __size-36"><button class="button-container __style-${style}"><span class="button-content">${llIcon(file)}${esc(n || 0)}</span></button></div>`;
}

/** Кнопка «класс» с --button-klass-count. Пустой счётчик → 0. */
function klassBtn(likes, { style = 'secondary' } = {}) {
  return `            <label class="button-wrapper __size-36 button-klass" style="--button-klass-count: ${esc(likes || 0)};"><input type="checkbox" hidden><span class="button-container __style-${style}"><span class="button-content">${llIcon('klass_16_20.svg', 'll-icon button-klass__icon-outline')}${llIcon('klass_filled_16_20.svg', 'll-icon button-klass__icon-filled')}<span class="button-klass__count"></span></span></span></label>`;
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

/* ── рендер одного поста ────────────────────────────────────────────────────── */
function renderPost(p, idx) {
  const { id, type, author, title, text, photos, likes, comments, reshares, link } = p;
  const ids = splitIds(author);
  const aid = ids[0];
  const time = TIMES[idx % TIMES.length];
  const x = EXTRAS[id] || {};

  switch (type) {
    /* ── базовый feed-text: text / photo / photo-gallery / video / group-post ── */
    case 'text': case 'photo': case 'photo-gallery': case 'video': case 'group-post': {
      const subscribe = isGroupId(aid); // group-post → «Подписаться» в шапке
      return `        <article class="text-feed island">
${authorHeader(aid, time, { subscribe })}

${feedText(text)}
${media(photos)}
${actionsBar(likes, comments, reshares)}
        </article>`.replace(/\n\n+/g, '\n\n');
    }

    /* ── реклама (feed-ad — как в NV, но в Q3-разметке text-feed) ── */
    case 'ad': {
      const subtitle = PEOPLE[String(aid)]?.subtitle || 'Реклама 0+';
      return `        <article class="text-feed island">
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
            <div class="button-wrapper __size-44 __full-width" style="display:block">
              <button class="button-container __style-primary" style="width:100%"><span class="button-content">Перейти</span></button>
            </div>
          </div>
        </article>`;
    }

    /* ── Возможно, вы знакомы — горизонтальный ряд vvz-card + help-карточка ── */
    case 'vvz-portlet': {
      const cards = ids.map((pid, i) => `
            <div class="vvz-card __default" data-dismiss-target>
              <div class="vvz-card__media">
                <div class="vvz-card__blur" data-person-bg="${esc(pid)}"></div>
                <img data-person-avatar="${esc(pid)}" alt="">
                <span class="vvz-card__close button-circle-wrapper __size-24 __style-on-image"><button class="button-circle" aria-label="Скрыть" data-dismiss><span class="icon __size-16 __slot-close"></span></button></span>
              </div>
              <div class="vvz-card__content">
                <div class="vvz-card__title ds-title-s" data-person-name="${esc(pid)}"></div>
                <div class="vvz-card__subtitle ds-caption-m">${esc(VVZ_SUBTITLES[i] || '10 общих друзей')}</div>
                <div class="vvz-card__btn button-wrapper __size-36 __full-width">
                  <button class="button-container __style-primary"><span class="button-content">Дружить</span></button>
                </div>
              </div>
            </div>`).join('\n');
      return `        <section class="vvz-portlet island" data-dismiss-row aria-label="Возможно, вы знакомы">
          <header class="vvz-portlet__header">
            <div class="vvz-portlet__title ds-title-l">Возможно, вы знакомы</div>
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
            <div class="text-feed__reshare-card-media" style="aspect-ratio: 328/240; overflow:hidden">
              ${img(photos[0], 'style="width:100%; height:100%; object-fit:cover; display:block" ')}
            </div>` : '';
      return `        <article class="text-feed island">
          <div class="ll-otd__caption ds-body-m">
            ${EYE_SVG}
            <span>Видите только вы</span>
          </div>
          <div class="ds-title-xl">${esc(title)}</div>

          <div class="text-feed__reshare-card">
            <div class="text-feed__reshare-card-author">
              <div class="avatar __size-24 __type-image">${img(personPhoto(aid))}</div>
              <div class="ds-body-m text-feed__reshare-card-author-name">Вы</div>
            </div>

            <p class="ds-body-m text-feed__body">${esc(text)}</p>${mediaBlock}
          </div>
${likesBlock}

          <div class="actions-bar">
            <div class="button-wrapper __size-44 __full-width">
              <button class="button-container __style-primary"><span class="button-content">
                ${SHARE_SVG}Поделиться
              </span></button>
            </div>
            <div class="button-wrapper __size-44 __pinned-end">
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
            <div class="text-feed__reshare-card-media" style="aspect-ratio: 4/3; overflow: hidden">
              ${img(photos[0], 'style="width:100%; height:100%; object-fit:cover; display:block" ')}
            </div>` : '';
      return `        <article class="text-feed island">
${authorHeader(aid, time)}

          <div class="text-feed__reshare-card">
            <div class="text-feed__reshare-card-author">
              <div class="avatar __size-24 __type-image">${img(personPhoto(inner))}</div>
              <div class="ds-body-m text-feed__reshare-card-author-name">${esc(personName(inner))}</div>
            </div>

${feedText(text)}${mediaBlock}
          </div>
${actionsBar(likes, comments, reshares)}
        </article>`;
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
${authorHeader(aid, time)}

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
      const preview = photos[0]
        ? `            <div class="text-feed__reshare-card-media" style="aspect-ratio: 328/164; overflow: hidden">${img(photos[0], 'style="width:100%; height:100%; object-fit:cover; display:block" ')}</div>`
        : `            <div class="text-feed__reshare-card-media" style="aspect-ratio: 328/164; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)"></div>`;
      return `        <article class="text-feed island">
${authorHeader(aid, time)}

${feedText(text)}

          <a class="text-feed__reshare-card" href="${esc(href)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
${preview}
            <div class="text-feed__link">
              <div class="ds-title-m">${esc(p.linkMeta?.title || x.title || domain)}</div>
              <div class="ds-body-m">${esc(p.linkMeta?.description || x.description || '')}</div>
              <div class="ds-caption-m">${esc(domain)}</div>
            </div>
          </a>
${actionsBar(likes, comments, reshares)}
        </article>`;
    }

    /* ── Подарок/открытка — получил … от … ── */
    case 'gift-received': {
      const caption = title || 'Получил подарок от';
      const giverId = ids[1] || ids[0];
      // CTA по содержимому подписи: подарок / ИИ / открытка (по умолчанию).
      let cta, btnWrap, icon;
      if (/ии|нейро/i.test(caption)) {
        cta = 'Создать ИИ подарок';
        btnWrap = ' __full-width ll-ai-gift-btn';
        icon = `<span class="icon __size-20 __src" style="--icon-src:url('assets/icons/sparkles_24.svg')"></span>`;
      } else if (/подар/i.test(caption)) {
        cta = 'Отправить подарок';
        btnWrap = '';
        icon = llIcon('gift_16_20.svg');
      } else {
        cta = 'Отправить открытку';
        btnWrap = '';
        icon = llIcon('gift_16_20.svg');
      }
      const mediaBlock = photos[0] ? `
            <div class="text-feed__reshare-card-media" style="aspect-ratio: 1; overflow: hidden">
              ${img(photos[0], 'style="width:100%; height:100%; object-fit:cover; display:block" ')}
            </div>` : '';
      return `        <article class="text-feed island">
${authorHeader(aid, time)}

          <div class="text-feed__reshare-card">
            <div class="ll-gift-from">
              <div class="ds-body-m">${esc(caption)}</div>
              <div class="text-feed__reshare-card-author">
                <div class="avatar __size-24 __type-image">${img(personPhoto(giverId))}</div>
                <div class="ds-body-m text-feed__reshare-card-author-name"><b style="font-weight:500">${esc(personName(giverId))}</b></div>
              </div>
            </div>${mediaBlock}
          </div>

          <div class="actions-bar">
            <div class="button-wrapper __size-36${btnWrap}">
              <button class="button-container __style-secondary"><span class="button-content">${icon}${cta}</span></button>
            </div>
            <div class="button-wrapper __size-36 __pinned-end"><button class="button-container __style-secondary" aria-label="Ещё"><span class="button-content">${llIcon('more_16_20.svg')}</span></button></div>
          </div>
        </article>`;
    }

    /* ── Годовщина дружбы — спец-класс feed-birthday ── */
    case 'friendversary': {
      const a1 = personPhoto(ids[0]) || 'https://i.pravatar.cc/288?img=49';
      const a2 = personPhoto(ids[1]) || 'https://i.pravatar.cc/288?img=23';
      return `        <article class="feed-birthday island">
          <div class="feed-birthday__deco"></div>

          <div class="feed-birthday__avatars">
            <div class="avatar __size-120 __type-image __border">${img(a1)}</div>
            <div class="avatar __size-120 __type-image __border">${img(a2)}</div>
          </div>

          <div class="ds-title-l feed-birthday__title">${esc(title)}</div>
          <div class="ds-body-m feed-birthday__text">${esc(text)}</div>

          <div class="actions-bar">
            <div class="button-wrapper __size-44 __full-width">
              <button class="button-container __style-primary" data-href="gifts-catalog.html"><span class="button-content"><span class="icon __size-20 __src feed-birthday__icon-gift"></span>Поздравить друга</span></button>
            </div>
            <div class="button-wrapper __size-44 __pinned-end"><button class="button-container __style-secondary" aria-label="Ещё"><span class="button-content"><span class="icon __size-20 __src feed-birthday__icon-more"></span></span></button></div>
          </div>
        </article>`;
    }

    /* ── Вас отметили на фото — full-bleed media + tooltip ── */
    case 'tagged-photo': {
      const hero = x.heroAvatar || 'https://i.pravatar.cc/192?img=49';
      const tag = x.tag || { name: 'Анастасия Кащеева', top: 28, left: 56 };
      return `        <article class="text-feed island">
          <div class="avatar __size-72 __type-image">${img(hero)}</div>
          <div class="ds-title-xl">${esc(title)}</div>

          <div class="text-feed__media ll-tagged__media">
            ${img(photos[0] || '')}
            <div class="tooltip-wrapper __view-primary __side-bottom __alignment-start __placement-bottom-start"
                 style="top: ${esc(tag.top)}px; left: ${esc(tag.left)}px">
              <div class="tooltip ds-title-m">${esc(tag.name)}</div>
              <div class="tooltip-tail"></div>
            </div>
          </div>

          <div class="actions-bar">
            <div class="button-wrapper __size-44 __full-width">
              <button class="button-container __style-primary"><span class="button-content">
                ${SHARE_SVG}Поделиться
              </span></button>
            </div>
          </div>
        </article>`;
    }

    /* ── Клип — full-bleed 9:16 с тёмными actions-overlay ── */
    case 'clip': {
      // Видео клипа — локальный файл из репы (как clip-feed в NV-ленте).
      // Если в листе дали свою ссылку на видео — используем её, иначе дефолт.
      const src = photos[0] || x.fallbackMedia;
      const visual = /\.(mp4|webm|mov)(\?|#|$)/i.test(src)
        ? `<video src="${esc(src)}" autoplay muted loop playsinline></video>`
        : img(src);
      return `        <article class="clip-feed">
          <div class="clip-feed__media">${visual}</div>

          <div class="clip-feed__header">
            <div class="avatar __size-44 __type-image">${img(personPhoto(aid))}</div>
            <div class="clip-feed__txt">
              <div class="ds-title-s">${esc(personName(aid))}</div>
              <div class="ds-caption-s clip-feed__time">${esc(time)}</div>
            </div>
          </div>

          <div class="clip-feed__mute" aria-hidden="true">🔇</div>

          <div class="actions-bar clip-feed__actions">
${countBtn('comment_16_20.svg', comments, { style: 'on-image' })}
${countBtn('reshare_16_20.svg', reshares, { style: 'on-image' })}
${klassBtn(likes, { style: 'on-image' })}
${moreBtn({ style: 'on-image' })}
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
  const file = resolve(ROOT, 'lenta-q3.html');
  let html = readFileSync(file, 'utf8');
  const START = '<!-- FEED:START (генерится scripts/fetch-q3.mjs — не редактировать вручную) -->';
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
      throw new Error('Не нашёл границы legacy-карточек в lenta-q3.html');
    html = html.slice(0, startIdx) + block + '\n\n' + html.slice(closeIdx + 1);
  }
  writeFileSync(file, html);
}

/* ── main ───────────────────────────────────────────────────────────────────── */
async function main() {
  // --offline: реген из data/q3-feed.json без обращения к таблице.
  const offline = process.argv.includes('--offline');
  let posts;

  if (offline) {
    console.log('→ Офлайн-реген из data/q3-feed.json (таблицу не тяну)…');
    posts = JSON.parse(readFileSync(resolve(ROOT, 'data/q3-feed.json'), 'utf8')).posts || [];
  } else {
    console.log(`→ Тяну «${SHEET_NAME}» из таблицы…`);
    const res = await fetch(csvUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} — проверь доступ к таблице по ссылке.`);
    const rows = parseCsv(await res.text());
    const [, ...body] = rows;

    posts = [];
    for (const c of body) {
      const id = (c[0] || '').trim();
      const type = (c[1] || '').trim();
      if (!id || !type) continue;
      posts.push({
        id, type,
        author: (c[2] || '').trim(),
        title: (c[3] || '').trim(),
        text: (c[4] || '').trim(),
        photos: (c[5] || '').split(',').map(s => s.trim()).filter(u => /^https?:\/\//.test(u)),
        likes: (c[6] || '').trim(),
        comments: (c[7] || '').trim(),
        reshares: (c[8] || '').trim(),
        link: (c[9] || '').trim(),
      });
    }

    // shared-link: тянем заголовок + первый абзац прямо со страницы (og:/title),
    // кладём в post.linkMeta — попадёт в json и переживёт офлайн-реген.
    for (const p of posts) {
      if (p.type === 'shared-link' && p.link) {
        const meta = await fetchLinkMeta(p.link);
        if (meta) { p.linkMeta = meta; console.log(`  ↳ ${p.id}: «${meta.title}»`); }
        else console.warn(`  ⚠️  ${p.id}: не удалось прочитать мету ${p.link} — оставляю заглушку`);
      }
    }

    writeFileSync(resolve(ROOT, 'data/q3-feed.json'),
      JSON.stringify({ _readme: { 'источник': `Google-таблица, лист «${SHEET_NAME}» (gid 1662648328)`, 'как_обновить': 'node scripts/fetch-q3.mjs  (офлайн-реген: node scripts/fetch-q3.mjs --offline)' }, posts }, null, 2) + '\n');
  }

  // Разложить компаньон-данные по актуальным id (привязка к ТИПУ карточки).
  for (const p of posts) if (COMPANION[p.type]) EXTRAS[p.id] = COMPANION[p.type];

  const cards = posts.map((p, i) => renderPost(p, i)).filter(Boolean).join('\n\n');
  splice(cards);

  console.log(`✓ ${posts.length} постов → data/q3-feed.json + вставлено в lenta-q3.html`);
  posts.forEach(p => console.log(`  • ${p.id.padEnd(8)} ${p.type}`));
}

main().catch(err => { console.error('✗', err.message); process.exit(1); });
