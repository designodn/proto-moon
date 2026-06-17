#!/usr/bin/env node
/**
 * fetch-feed.mjs — собирает ленту NV из листа «Посты» Google-таблицы.
 *
 *   node scripts/fetch-feed.mjs
 *
 * Что делает:
 *   1. тянет лист «Посты» (gviz CSV) → массив постов;
 *   2. пишет data/feed.json (запись «как есть» из таблицы);
 *   3. рендерит карточки в точной разметке NV-компонентов
 *      (авторы — через data-person-* + people-data.js, медиа — реальные ссылки);
 *   4. вставляет их в new-vision/lenta.html между <!-- FEED:START/END -->.
 *
 * Требование: таблица открыта «всем, у кого есть ссылка».
 *
 * Компаньон-данные карточек, которых нет в основном листе (тексты вопросов,
 * топ-коммент обсуждения, друзья в поздравлении/группе, подписи моментов),
 * лежат в EXTRAS ниже — ключ = id поста.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SPREADSHEET_ID = '1Ctwjp2J0HSmvb6kL4NoDqaB9W4QfdAXXDnzyBDLYZ7Y';
const SHEET_NAME = 'Посты';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const csvUrl =
  `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
  `?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;

/* ── Компаньон-данные (то, чего нет в основном листе) ─────────────────────── */
const EXTRAS = {
  // questions: подписи и категории карточек (авторы берутся из листа, по порядку)
  'post-19': {
    questions: [
      { title: 'Соседи, подскажите мастера по окнам',            category: 'Ремонт' },
      { title: 'Подскажите хорошего стоматолога в нашем районе', category: 'Стоматолог' },
    ],
  },
  // discussion: топ-комментарий
  'post-21': {
    topComment: {
      authorId: 2,
      time: '3 часа назад',
      text: 'Это не просто «фяк», это — полноценный «пошли вон, а то порву на тряпки!» и ты…',
      likes: 2,
    },
    moreReplies: 'Посмотреть 35 ответов',
  },
  // birthday: друзья, поздравившие именинника
  'post-18': { friends: { ids: [1, 3], more: 3, text: '12 друзей поздравило' } },
  // group-invite: друзья-подписчики
  'post-20': { friends: { ids: [1, 4], more: 3, text: '5 друзей подписаны' } },
  // stories-moments: какие кольца «просмотрено» (по индексу аватарки)
  'post-22': { viewed: [false, false, true, false] },
  // gift: получатель/даритель (показывается под подписью)
  'post-15': { reshareId: 1 },
  'post-8':  { reshareId: 3 },
};

/* Дефолтное время поста (время убрали из таблицы — это «реквизит» шаблона). */
const TIMES = ['08:15', '09:35', '11:18', '12:48', '14:02', '15:20', '17:46', '18:42', '20:10', '21:33'];

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

/* ── people.json: имена/инициалы/группы для рендера ────────────────────────── */
const peopleRaw = JSON.parse(readFileSync(resolve(ROOT, 'data/people.json'), 'utf8')).people;
const PEOPLE = {};
peopleRaw.forEach(p => { PEOPLE[String(p.id)] = p; });

const isGroupId = id => /^group-/.test(String(id));
const firstName = id => (PEOPLE[String(id)]?.name || '').split(/[\s(]/)[0] || '';
function initialsOf(name) {
  const words = String(name).replace(/[«»"']/g, ' ').trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map(w => w[0]).join('') || '?').toUpperCase();
}

/* ── helpers разметки ───────────────────────────────────────────────────────── */
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SECONDARY = 'color: var(--dynamic-text-and-icons-base-secondary);';

function subscribeBtn() {
  return `<label class="button-wrapper __size-28 button-subscribe"><input type="checkbox" hidden><span class="button-container __style-secondary"><span class="button-content"><span class="button-subscribe__label-default">Подписаться</span><span class="button-subscribe__label-subscribed">Подписан</span></span></span></label>`;
}

/** Шапка автора (uni-cell). id — число/строка из people, либо {name} для рекламы. */
function authorHeader(id, { size = 36, nameClass = 'ds-title-s', subtitle = '', subscribe = true, literalName = null } = {}) {
  let avatar, name;
  if (literalName != null) {
    avatar = `<div class="avatar __size-${size} __type-initials">${esc(initialsOf(literalName))}</div>`;
    name = `<div class="${nameClass}">${esc(literalName)}</div>`;
  } else {
    avatar = `<div class="avatar __size-${size} __type-image"><img data-person-avatar="${esc(id)}" alt=""></div>`;
    name = `<div class="${nameClass}" data-person-name="${esc(id)}"></div>`;
  }
  const sub = subtitle ? `\n            <div class="ds-caption-m" style="${SECONDARY}">${esc(subtitle)}</div>` : '';
  return `        <div class="uni-cell-wrapper"><div class="uni-cell-container"><div class="uni-cell">
          ${avatar}
          <div class="contents-view-container uni-cell-additional-content">
            ${name}${sub}
          </div>${subscribe ? '\n          ' + subscribeBtn() : ''}
        </div></div></div>`;
}

/** Хлебные крошки из темы/рубрики. */
function breadcrumbs(tema, rubrika) {
  const items = [];
  if (tema)    items.push({ label: tema, dzen: tema === 'Дзен' });
  if (rubrika) items.push({ label: rubrika });
  if (!items.length) return '';
  return '        <nav class="breadcrumbs">\n' + items.map((it, i) => {
    const on = i === items.length - 1 ? ' __state-on' : '';
    const badge = it.dzen ? '<img class="breadcrumbs__badge" src="../assets/new-vision/dzen-badge.png" alt="">' : '';
    const sep = i < items.length - 1 ? '\n          <span class="breadcrumbs__separator" aria-hidden="true"></span>' : '';
    return `          <span class="breadcrumbs__item${on}">${badge}${esc(it.label)}</span>${sep}`;
  }).join('\n') + '\n        </nav>';
}

/** Текстовый блок поста с «Раскрыть текст». */
function feedText(text, clamp) {
  if (!text) return '';
  const style = clamp ? ` style="--feed-text-clamp: ${clamp};"` : '';
  return `        <div class="feed-text"${style}>
          <p class="feed-text__body ds-body-m">${esc(text)}</p>
          <label class="feed-text__expand button-inline-wrapper __size-20 __view-primary"><input type="checkbox" hidden><span class="button-inline __size-20"><span class="button-inline__content"><span class="feed-text__label-collapsed">Раскрыть текст</span><span class="feed-text__label-expanded">Свернуть</span></span></span></label>
        </div>`;
}

/** Лайки / комменты / репосты. Пустые счётчики → иконка без числа (кроме класса).
 *  Иконки экшенов — отдельный NV-пак (assets/new-vision-icons/), рендерятся как
 *  обычные <img class="ll-icon"> (не CSS-маска): у глифов зашит fill, поэтому
 *  они сразу видимы и совпадают по цвету с q3-лентой. «Троеточие» — общий слот. */
function actionsBar(likes, comments, reshares) {
  const klassVar = likes ? ` style="--button-klass-count: ${likes};"` : '';
  const nvIcon = (file, extraClass = '') =>
    `<img class="ll-icon${extraClass}" src="../assets/new-vision-icons/${file}" width="20" height="20" alt="">`;
  const num = (file, n) =>
    `<div class="button-wrapper __size-36"><button class="button-container __style-secondary"><span class="button-content">${nvIcon(file)}${n ? esc(n) : ''}</span></button></div>`;
  return `        <div class="actions-bar">
          <label class="button-wrapper __size-36 button-klass"${klassVar}><input type="checkbox" hidden><span class="button-container __style-secondary"><span class="button-content">${nvIcon('glyph_like_24.svg', ' button-klass__icon-outline')}${nvIcon('glyph_like_24.svg', ' button-klass__icon-filled')}<span class="button-klass__count"></span></span></span></label>
          ${num('glyph_comment_24.svg', comments)}
          ${num('glyph_reshare_24.svg', reshares)}
          <div class="button-wrapper __size-36 __pinned-end"><button class="button-container __style-secondary" style="width: 36px;"><span class="button-content"><span class="icon __size-20 __slot-dots"></span></span></button></div>
        </div>`;
}

const ctaButton = (label, { style = 'primary', extraClass = '' } = {}) =>
  `        <div class="button-wrapper __size-44 __full-width" style="display: block;">
          <button class="button-container ${extraClass || '__style-' + style}" style="width: 100%;"><span class="button-content">${label}</span></button>
        </div>`;

/* ── медиа ──────────────────────────────────────────────────────────────────── */
const img = (url, attr = '') => `<img ${attr}src="${esc(url)}" alt="">`;

function mediaPhoto(photos)  { return photos[0] ? `        <div class="media __aspect-4-3">${img(photos[0])}</div>` : ''; }
function mediaVideo(photos)  {
  const poster = photos[0] ? img(photos[0]) : '';
  return `        <div class="media __aspect-4-3 __type-video">${poster}
          <div class="media__play button-circle-wrapper __size-56"><button class="button-circle" aria-label="Play"><span class="icon __slot-play"></span></button></div>
        </div>`;
}
function mediaClip(photos) {
  const poster = photos[0] ? img(photos[0]) : '';
  return `        <div class="media __type-clip">${poster}
          <button class="media__mute" aria-label="Mute">🔇</button>
        </div>`;
}
function mediaGallery(photos) {
  const cells = photos.slice(0, 4).map((u, i) => {
    const more = (i === 3 && photos.length > 4) ? ` __more" data-more="${photos.length - 3}` : '';
    return `          <div class="media__cell${more.includes('__more') ? more : '"'}>${img(u)}</div>`;
  });
  // нормализуем кавычки в классе ячейки
  const fixed = photos.slice(0, 4).map((u, i) => {
    if (i === 3 && photos.length > 4)
      return `          <div class="media__cell __more" data-more="${photos.length - 3}">${img(u)}</div>`;
    return `          <div class="media__cell">${img(u)}</div>`;
  });
  return `        <div class="media __type-gallery">\n${fixed.join('\n')}\n        </div>`;
}

/* ── друзья (avatars-view) для birthday / group-invite ─────────────────────── */
function avatarsView(friends) {
  if (!friends) return '';
  const stack = friends.ids.map(id =>
    `            <div class="avatar __size-36 __type-image"><img data-person-avatar="${esc(id)}" alt=""></div>`).join('\n');
  const more = friends.more ? `\n            <div class="avatars-view__more">+${friends.more}</div>` : '';
  return `        <div class="avatars-view __size-36">
          <div class="avatars-view__stack">
${stack}${more}
          </div>
          <span class="avatars-view__text">${esc(friends.text)}</span>
        </div>`;
}

/* ── рендер одного поста ────────────────────────────────────────────────────── */
function renderPost(p, idx) {
  const { id, type, author, title, text, photos, likes, comments, reshares, tema, rubrika } = p;
  const grp = isGroupId(author);
  const time = TIMES[idx % TIMES.length];
  const x = EXTRAS[id] || {};

  const head = (size, opts = {}) => {
    const subtitle = opts.subtitle !== undefined ? opts.subtitle : (grp ? 'Сообщество' : time);
    return authorHeader(author, { size, subtitle, ...opts });
  };

  switch (type) {
    /* ── feed-base: text / photo / gallery / clip / video / article / question ── */
    case 'text': case 'photo': case 'gallery': case 'clip': case 'video':
    case 'article': case 'question': {
      const entity = grp ? ' data-entity="group"' : '';
      const parts = [];
      if (type === 'article') {
        parts.push(breadcrumbs(tema, rubrika));
        parts.push(head(44, { nameClass: 'ds-title-m' }));
        parts.push(`        <h2 class="nv-feed__title ds-title-l">${esc(title)}</h2>`);
        if (text) parts.push(`        <p class="ds-body-m">${esc(text)}</p>`);
        parts.push(mediaPhoto(photos));
      } else {
        parts.push(head(36));
        parts.push(breadcrumbs(tema, rubrika));
        if (title) parts.push(`        <h2 class="nv-feed__title ds-title-l">${esc(title)}</h2>`);
        parts.push(feedText(text));
        if (type === 'video')   parts.push(mediaVideo(photos));
        if (type === 'clip')    parts.push(mediaClip(photos));
        if (type === 'gallery') parts.push(mediaGallery(photos));
        if (type === 'photo')   parts.push(mediaPhoto(photos));
      }
      parts.push(actionsBar(likes, comments, reshares));
      return `      <article class="feed-base island"${entity}>\n${parts.filter(Boolean).join('\n')}\n      </article>`;
    }

    /* ── реклама ── */
    case 'ad': {
      const parts = [
        authorHeader(null, { size: 44, literalName: author, subtitle: 'Реклама 0+', subscribe: false }),
        feedText(text, 2),
        mediaPhoto(photos),
        ctaButton('Перейти'),
      ];
      return `      <article class="feed-ad island" data-entity="group">\n${parts.filter(Boolean).join('\n')}\n      </article>`;
    }

    /* ── день рождения ── */
    case 'birthday': {
      const parts = [
        `        <div class="avatar __size-72 __type-image"><img data-person-avatar="${esc(author)}" alt=""></div>`,
        `        <h2 class="nv-feed__title ds-title-l">${esc(title)}</h2>`,
        avatarsView(x.friends),
        ctaButton('<span class="icon __size-20 __src" style="--icon-src:url(\'../assets/icons/gift_24.svg\')"></span>Поздравить', { extraClass: 'nv-gift-btn' }),
      ];
      return `      <article class="feed-congrats __birthday island __intro">\n${parts.filter(Boolean).join('\n')}\n      </article>`;
    }

    /* ── приглашение в сообщество ── */
    case 'group-invite': {
      const parts = [
        `        <div class="avatar __size-72 __type-image"><img data-person-avatar="${esc(author)}" alt=""></div>`,
        `        <h2 class="nv-feed__title ds-title-l">${esc(title)}</h2>`,
        avatarsView(x.friends),
        ctaButton('Подписаться', { style: 'secondary' }),
      ];
      return `      <article class="feed-group island">\n${parts.filter(Boolean).join('\n')}\n      </article>`;
    }

    /* ── подарок ── */
    case 'gift': {
      const created = /создал/i.test(text || '');
      const reshare = x.reshareId
        ? `\n          <div class="nv-gift-card__reshare">
            <div class="avatar __size-24 __type-image"><img data-person-avatar="${esc(x.reshareId)}" alt=""></div>
            <span class="ds-title-s" data-person-name="${esc(x.reshareId)}"></span>
          </div>`
        : '';
      const media = photos[0] ? `\n          <div class="media __aspect-1-1">${img(photos[0])}</div>` : '';
      const btn = created
        ? ctaButton('✨&nbsp;Создать подарок', { extraClass: 'nv-gift-btn __create' })
        : ctaButton('<span class="icon __size-20 __src" style="--icon-src:url(\'../assets/icons/gift_24.svg\')"></span>Отправить подарок', { extraClass: 'nv-gift-btn' });
      return `      <article class="feed-congrats __gift island __intro">
${authorHeader(author, { size: 44, nameClass: 'ds-title-m', subtitle: time, subscribe: false })}
        <div class="nv-gift-card">
          <p class="nv-gift-card__caption">${esc(text)}</p>${reshare}${media}
        </div>
${btn}
      </article>`;
    }

    /* ── нужен совет (карточки) ── */
    case 'questions': {
      const ids = String(author).split(',').map(s => s.trim()).filter(Boolean);
      const cards = ids.map((aid, i) => {
        const q = (x.questions || [])[i] || { title: '', category: '' };
        return `          <div class="question-card">
            <div class="uni-cell-wrapper"><div class="uni-cell-container"><div class="uni-cell">
              <div class="avatar __size-24 __type-image"><img data-person-avatar="${esc(aid)}" alt=""></div>
              <div class="uni-cell-additional-content"><div class="ds-body-m" data-person-name="${esc(aid)}"></div></div>
            </div></div></div>
            <div class="question-card__title">${esc(q.title)}</div>
            <div class="question-card__category">${esc(q.category)}</div>
          </div>`;
      }).join('\n');
      return `      <article class="feed-questions island">
${breadcrumbs(tema, rubrika)}
        <h2 class="nv-feed__title ds-title-l">${esc(title)}</h2>
        <div class="feed-questions__list">
${cards}
        </div>
      </article>`;
    }

    /* ── обсуждают ── */
    case 'discussion': {
      const c = x.topComment;
      const comment = c ? `        <div class="comment __type-compact">
          <div class="avatar __size-36 __type-image"><img data-person-avatar="${esc(c.authorId)}" alt=""></div>
          <div class="comment__body">
            <div class="comment__header"><b data-person-name="${esc(c.authorId)}"></b>· ${esc(c.time)}</div>
            <p class="comment__text">${esc(c.text)}</p>
            <div class="comment__actions">
              <span class="button-inline-wrapper __size-20 __view-secondary"><button class="button-inline __size-20"><span class="button-inline__content"><span class="button-inline__icon icon __size-16 __slot-arrow-left"></span>Ответить</span></button></span>
              <span class="button-inline-wrapper __size-20 __view-secondary"><button class="button-inline __size-20"><span class="button-inline__content"><span class="button-inline__icon icon __size-16 __slot-klass-outline"></span>${esc(c.likes)}</span></button></span>
            </div>
          </div>
        </div>` : '';
      const more = x.moreReplies
        ? `        <span class="button-inline-wrapper __size-20 __view-primary"><button class="button-inline __size-20"><span class="button-inline__content">${esc(x.moreReplies)}</span></button></span>`
        : '';
      const body = text ? `        <p class="ds-body-m">${esc(text)}</p>` : '';
      return `      <article class="feed-discussion island">
${breadcrumbs(tema, rubrika)}
${authorHeader(author, { size: 36, subtitle: time })}
        <header class="header __size-xl">
          <h2 class="header__title">${esc(title)}</h2>
        </header>
${body}
        <hr class="ds-divider">
${comment}
${more}
        <div class="comment-input">
          <div class="avatar __size-36 __type-image"><img data-person-avatar="my_profile" alt=""></div>
          <input class="text-input __size-36" placeholder="Написать ответ…">
        </div>
      </article>`;
    }

    /* ── воспоминание ── */
    case 'memory': {
      const self = String(author) === 'my_profile';
      const parts = [
        breadcrumbs(tema, rubrika),
        `        <h2 class="nv-feed__title ds-title-l">${esc(title)}</h2>`,
        authorHeader(author, { size: 36, subtitle: '5 лет назад', subscribe: false }),
        text ? `        <p class="ds-body-m">${esc(text)}</p>` : '',
        mediaPhoto(photos),
        ctaButton('Поделиться снова', { style: 'secondary' }),
      ];
      return `      <article class="feed-memory island" data-entity="${self ? 'self' : 'user'}">\n${parts.filter(Boolean).join('\n')}\n      </article>`;
    }

    /* ── конкурс ── */
    case 'contest': {
      const pics = photos.slice(0, 4).map(u =>
        `          <div class="picture __size-96">${img(u)}</div>`).join('\n');
      return `      <article class="feed-contest island">
${breadcrumbs(tema, rubrika)}
        <h2 class="nv-feed__title ds-title-l">${esc(title)}</h2>
        <div class="picture-stack">
${pics}
        </div>
${ctaButton('📷 Загрузить фото', { style: 'secondary' })}
${ctaButton('🖼 Смотреть работы', { style: 'secondary' })}
      </article>`;
    }

    /* ── моменты (сториз в ленте) ── */
    case 'stories-moments': {
      const ids = String(author).split(',').map(s => s.trim()).filter(Boolean);
      const viewed = x.viewed || [];
      const avas = ids.map((aid, i) => {
        const ring = viewed[i] ? '__ring-viewed' : '__ring-active';
        return `          <div class="avatar __size-56 __type-image ${ring} __has-caption">
            <img data-person-avatar="${esc(aid)}" alt="">
            <div class="avatar__caption">${esc(firstName(aid))}</div>
          </div>`;
      }).join('\n');
      return `      <article class="feed-stories island">
${breadcrumbs(tema, rubrika)}
        <h2 class="nv-feed__title ds-title-l">${esc(title)}</h2>
        <div class="feed-stories__list">
${avas}
        </div>
      </article>`;
    }

    default:
      console.warn(`  ⚠️  неизвестный тип «${type}» (${id}) — пропущен`);
      return '';
  }
}

/* ── splice в lenta.html ────────────────────────────────────────────────────── */
function splice(cardsHtml) {
  const file = resolve(ROOT, 'new-vision/lenta.html');
  let html = readFileSync(file, 'utf8');
  const START = '<!-- FEED:START (генерится scripts/fetch-feed.mjs — не редактировать вручную) -->';
  const END = '<!-- FEED:END -->';
  const block = `${START}\n${cardsHtml}\n      ${END}`;

  if (html.includes(START)) {
    html = html.replace(new RegExp(escRe(START) + '[\\s\\S]*?' + escRe(END)), block);
  } else {
    // первая генерация: вырезаем legacy-карточки 1–23 между сториз-каруселью и
    // закрытием .feed-container (перед промо-баннером).
    const startIdx = html.indexOf('<!-- 1. Текст + видео -->');
    const closeIdx = html.indexOf('\n\n      </div>\n\n      <!-- Промо-баннер');
    if (startIdx === -1 || closeIdx === -1)
      throw new Error('Не нашёл границы legacy-карточек в lenta.html');
    html = html.slice(0, startIdx) + block + html.slice(closeIdx);
  }
  writeFileSync(file, html);
}
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ── main ───────────────────────────────────────────────────────────────────── */
async function main() {
  console.log(`→ Тяну «${SHEET_NAME}» из таблицы…`);
  const res = await fetch(csvUrl, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} — проверь доступ к таблице по ссылке.`);
  const rows = parseCsv(await res.text());
  const [, ...body] = rows;

  const posts = [];
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
      tema: (c[9] || '').trim(),
      rubrika: (c[10] || '').trim(),
    });
  }

  writeFileSync(resolve(ROOT, 'data/feed.json'),
    JSON.stringify({ _readme: { 'источник': `Google-таблица, лист «${SHEET_NAME}»`, 'как_обновить': 'node scripts/fetch-feed.mjs' }, posts }, null, 2) + '\n');

  const cards = posts.map((p, i) => renderPost(p, i)).filter(Boolean).join('\n\n');
  splice(cards);

  console.log(`✓ ${posts.length} постов → data/feed.json + вставлено в new-vision/lenta.html`);
  posts.forEach(p => console.log(`  • ${p.id.padEnd(8)} ${p.type}`));
}

main().catch(err => { console.error('✗', err.message); process.exit(1); });
