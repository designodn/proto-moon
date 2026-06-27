#!/usr/bin/env node
/**
 * fetch-profile.mjs — собирает посты ПРОФИЛЯ (profile.html) из листа «профиль»
 * Google-таблицы (gid 877262163, та же таблица, что и Q3).
 *
 *   node scripts/fetch-profile.mjs            — тянет лист и перегенерит посты
 *   node scripts/fetch-profile.mjs --offline  — реген из data/profile-posts.json (без сети)
 *
 * Что делает (полный аналог scripts/fetch-q3.mjs, но для двух секций профиля):
 *   1. тянет лист «профиль» (gviz CSV) → массив постов;
 *   2. пишет data/profile-posts.json (запись «как есть» из таблицы);
 *   3. рендерит карточки в ТОЧНОЙ Q3-разметке (переиспользуя рендереры fetch-q3.mjs);
 *   4. вставляет их в profile.html в ДВЕ секции:
 *        • data-self-posts     ↔ <!-- PROFILE-POSTS:SELF:START/END -->
 *        • data-stranger-posts ↔ <!-- PROFILE-POSTS:STRANGER:START/END -->
 *
 * Ключевое отличие от Q3: колонка «автор» в листе ПУСТАЯ — каждый пост профиля
 * пишет хозяин профиля. Поэтому шапку автора НЕ запекаем из people.json, а
 * подставляем runtime-атрибуты, которые заполняет страница:
 *   • SELF      → data-pr-avatar / data-pr-name            (user-data.js);
 *   • STRANGER  → data-pr-subject-avatar / data-pr-subject-name (скрипт страницы).
 * Авторы КОММЕНТОВ — настоящие люди (id из листа) → имена/авы из people.json,
 * как в fetch-q3 (commentItem/renderCommentThread переиспользуются без изменений).
 *
 * Требование: таблица открыта «всем, у кого есть ссылка».
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  renderPost, attachComments, esc, img, COMPANION, EXTRAS, SPREADSHEET_ID, parseCsv,
} from './fetch-q3.mjs';
import { createMediaCache } from './lib/media-cache.mjs';
import { createSyncGate } from './lib/sheet-cache.mjs';

const CHECK_ONLY = process.argv.includes('--check');
const FORCE = process.argv.includes('--force');   // пересобрать, даже если лист не менялся

const SHEET_NAME = 'профиль';            // человекочитаемое имя листа (для логов)
const SHEET_GID = '877262163';           // стабильный gid листа профильных постов

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const csvUrl =
  `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
  `?tqx=out:csv&gid=${SHEET_GID}&headers=1`;

/* Время поста — реквизит шаблона (в листе его нет), как TIMES в fetch-q3. */
const TIMES = ['Вчера, 19:30', '2 дня назад', '5 дней назад', 'Неделю назад', 'Вчера, 18:02', '3 дня назад', '10 дней назад', '2 недели назад'];

/* ── Шапка автора профиля (uni-cell) — вместо запекания человека из people.json
 * подставляем runtime data-атрибуты хозяина профиля. variant: 'self' | 'subject'.
 * Разметка байт-в-байт совпадает с authorHeader() из fetch-q3 (uni-cell, ава
 * __size-44, имя ds-title-s, время text-feed__time) — отличаются только атрибуты
 * автора. Профильные посты не бывают group-* → кнопку «Подписаться» игнорируем. */
function ownerHeader(variant) {
  const avatarAttr = variant === 'subject' ? 'data-pr-subject-avatar' : 'data-pr-avatar';
  const nameAttr = variant === 'subject' ? 'data-pr-subject-name' : 'data-pr-name';
  return (id, time /*, opts */) =>
    `          <div class="uni-cell-wrapper"><div class="uni-cell-container"><div class="uni-cell">
            <div class="avatar __size-44 __type-image"><img ${avatarAttr} alt=""></div>
            <div class="uni-cell-additional-content">
              <div class="ds-title-s" ${nameAttr}></div>
              <div class="ds-caption-s text-feed__time">${esc(time)}</div>
            </div>
          </div></div></div>`;
}

/* ── Рендер всех постов для одного варианта (self/subject) ─────────────────── */
function renderAll(posts, variant) {
  const authorHeader = ownerHeader(variant);
  const rendered = posts
    .map((p, i) => {
      // Автор в листе пуст → подменяем шапку на owner-вариант (data-pr-*).
      // my_profile нужен лишь как непустой aid, чтобы renderPost не падал; в
      // owner-шапке id не используется (атрибуты заполнит страница). Время — из
      // нашего TIMES (часы профиля), а не из q3-TIMES.
      const post = { ...p, author: p.author || 'my_profile' };
      const time = TIMES[i % TIMES.length];
      const card = renderPost(post, i, { authorHeader: (id, _t, opts) => authorHeader(id, time, opts) });
      return card ? attachComments(card, post) : card;
    })
    .filter(Boolean);
  if (rendered.length === 0)
    throw new Error('не отрисовано ни одной карточки профиля — секции НЕ тронуты (проверь лист/типы).');
  return rendered.join('\n\n');
}

/* ── splice в profile.html (две секции) ───────────────────────────────────── */
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function spliceSection(html, kind, cardsHtml) {
  const START = `<!-- PROFILE-POSTS:${kind}:START (генерится scripts/fetch-profile.mjs — не редактировать вручную) -->`;
  const END = `<!-- PROFILE-POSTS:${kind}:END -->`;
  const block = `${START}\n${cardsHtml}\n        ${END}`;
  if (html.includes(START)) {
    return html.replace(new RegExp(escRe(START) + '[\\s\\S]*?' + escRe(END)), block);
  }
  // Первая генерация: вырезаем статические <article> внутри нужной секции.
  const dataAttr = kind === 'SELF' ? 'data-self-posts' : 'data-stranger-posts';
  const secRe = new RegExp(
    `(<section class="ll-pr-posts" ${dataAttr} hidden>)([\\s\\S]*?)(\\n      </section>)`);
  const m = html.match(secRe);
  if (!m) throw new Error(`не нашёл секцию ${dataAttr} в profile.html`);
  return html.replace(secRe, `$1\n\n        ${block}\n$3`);
}

function splice(selfCards, strangerCards) {
  const file = resolve(ROOT, 'profile.html');
  let html = readFileSync(file, 'utf8');
  html = spliceSection(html, 'SELF', selfCards);
  html = spliceSection(html, 'STRANGER', strangerCards);
  writeFileSync(file, html);
}

/* ── main ─────────────────────────────────────────────────────────────────── */
async function main() {
  const offline = process.argv.includes('--offline');
  let posts;
  let gate = null;

  if (offline) {
    console.log('→ Офлайн-реген из data/profile-posts.json (таблицу не тяну)…');
    posts = JSON.parse(readFileSync(resolve(ROOT, 'data/profile-posts.json'), 'utf8')).posts || [];
  } else {
    console.log(`→ Тяну «${SHEET_NAME}» из таблицы…`);
    const res = await fetch(csvUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} — проверь доступ к таблице по ссылке.`);
    const csvText = await res.text();
    // Зависимости: рендереры из fetch-q3.mjs + people.json (имена/аватары
    // комментаторов запекаются) → их правка тоже пересобирает профиль.
    gate = createSyncGate({ root: ROOT, key: 'profile',
      codeDeps: [fileURLToPath(import.meta.url), resolve(__dirname, 'fetch-q3.mjs'),
                 resolve(__dirname, 'lib/media-cache.mjs'), resolve(ROOT, 'data/people.json')] });
    if (gate.unchanged(csvText) && !FORCE && !CHECK_ONLY) {
      console.log(`✓ «${SHEET_NAME}» без изменений — пропускаю (--force чтобы пересобрать).`);
      return;
    }
    const rows = parseCsv(csvText);
    const [header = [], ...body] = rows;

    // Колонки матчим ПО ИМЕНИ заголовка (порядок столбцов в этом листе слегка
    // другой — комменты/репосты/лайки идут иначе, чем в Q3). startsWith для
    // «фото (ссылки …)».
    const head = header.map(h => String(h || '').trim().toLowerCase());
    const col = (...names) => {
      for (const n of names) {
        const i = head.findIndex(h => h === n || h.startsWith(n + ' '));
        if (i >= 0) return i;
      }
      return -1;
    };
    const I = {
      type: col('тип'),
      tema: col('тема'), rubrika: col('рубрика'), header: col('шапка'),
      author: col('автор'),
      title: col('заголовок'), text: col('текст'), desc: col('описание'),
      photos: col('фото'),
      comments: col('комменты'), reshares: col('репосты'), likes: col('лайки'),
      link: col('ссылка'), marathon: col('марафон'),
      c1Author: col('автор коммента 1'), c1Text: col('текст коммента 1'),
      c2Author: col('автор коммента 2'), c2Text: col('текст коммента 2'),
    };

    // Защита от чужой схемы: лист профиля обязан иметь колонку «тип».
    if (I.type < 0) {
      throw new Error(
        `лист по gid=${SHEET_GID} не похож на профильный (нет колонки «тип»): ` +
        `${head.join(' | ')}. Посты НЕ перегенерированы — проверь доступ/лист.`);
    }

    const cell = (c, i) => (i >= 0 ? (c[i] || '').trim() : '');
    posts = [];
    let rowNum = 0;
    for (const c of body) {
      rowNum++;
      const type = cell(c, I.type);
      if (!type) continue;
      posts.push({
        id: `profile-${rowNum}`, type,
        author: cell(c, I.author),    // обычно пусто → хозяин профиля
        tema: cell(c, I.tema), rubrika: cell(c, I.rubrika),
        header: cell(c, I.header),
        title: cell(c, I.title),
        text: cell(c, I.text),
        desc: cell(c, I.desc),
        photos: cell(c, I.photos).split(',').map(s => s.trim()).filter(u => /^https?:\/\//.test(u)),
        photosRaw: cell(c, I.photos).split(',').map(s => s.trim()).filter(Boolean),
        likes: cell(c, I.likes),
        comments: cell(c, I.comments),
        reshares: cell(c, I.reshares),
        link: cell(c, I.link),
        marathon: cell(c, I.marathon),
        threadComments: [
          { authorId: cell(c, I.c1Author), text: cell(c, I.c1Text) },
          { authorId: cell(c, I.c2Author), text: cell(c, I.c2Text) },
        ].filter(x => x.text),
      });
    }

    // Кэшируем фото постов локально (запекаются в profile.html, корень) — чтобы
    // не зависеть от чужих CDN. Аватары авторов/комментаторов уже локальные.
    const cache = createMediaCache({
      root: ROOT, dirRel: 'assets/profile',
      manifestPath: resolve(ROOT, 'data/profile-media.json'), dryRun: CHECK_ONLY,
    });
    for (const p of posts) {
      if (Array.isArray(p.photos) && p.photos.length)
        p.photos = await Promise.all(p.photos.map(u => cache.resolveUrl(u)));
    }
    cache.save();
    console.log('  ' + cache.report());

    if (CHECK_ONLY) { console.log('(--check) Ссылки проверены, ничего не записано.'); return; }

    writeFileSync(resolve(ROOT, 'data/profile-posts.json'),
      JSON.stringify({ _readme: { 'источник': `Google-таблица, лист «${SHEET_NAME}» (gid ${SHEET_GID})`, 'как_обновить': 'node scripts/fetch-profile.mjs  (офлайн-реген: node scripts/fetch-profile.mjs --offline)' }, posts }, null, 2) + '\n');
  }

  // Разложить компаньон-данные по актуальным id (привязка к ТИПУ карточки) —
  // тот же механизм, что в fetch-q3 (на случай reshare-post и т.п.).
  for (const p of posts) if (COMPANION[p.type]) EXTRAS[p.id] = COMPANION[p.type];

  const selfCards = renderAll(posts, 'self');
  const strangerCards = renderAll(posts, 'subject');
  splice(selfCards, strangerCards);

  if (gate) gate.commit();
  console.log(`✓ ${posts.length} постов → data/profile-posts.json + вставлено в profile.html (self + stranger)`);
  posts.forEach(p => console.log(`  • ${p.id.padEnd(10)} ${p.type}`));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(err => { console.error('✗', err.message); process.exit(1); });
}
