/**
 * dead-links.mjs — сводка «битых» медиа-ссылок после синка из Google-таблицы.
 *
 * Зачем: media-cache (lib/media-cache.mjs) при синке помечает недоступные ссылки
 * в манифесте data/<feed>-media.json как `status: 'dead'` и хранит исходный URL
 * в поле `src` (копии нет → в ленте остаётся внешний URL «как было»). Этот модуль
 * собирает такие записи по ВСЕМ манифестам и подсказывает, ГДЕ их искать в таблице:
 * на каком ЛИСТЕ и в какой СТРОКЕ.
 *
 *   import { scanDeadLinks } from './lib/dead-links.mjs';
 *   const dead = scanDeadLinks(ROOT);   // [{ sheet, where, url }]
 *
 * Модуль ЧИСТО ЧИТАЮЩИЙ и никогда не кидает: битый/странный JSON или отсутствующий
 * файл — просто пропускаются. Сервер вызывает его после uploadSnapshot и кладёт
 * результат в lastSync (поля deadCount/dead), а страница /content его показывает.
 *
 * Лист и строка:
 *   • Лист — человекочитаемое имя из MAP (манифест → { sheet, feed, items }).
 *     Связки взяты из scripts/fetch-*.mjs (какой лист читается, какие data/-файлы
 *     и -media.json пишутся).
 *   • Строка — ищем в соответствующем фид-файле элемент, медиа-поля которого
 *     ссылаются на dead-`src` (у dead-записи в ленте остаётся внешний URL, поэтому
 *     src лежит прямо в полях элемента: photos/photosRaw/video/image/photo/avatar…).
 *     Строка = (числовой суффикс id) + 1 — первая строка листа это заголовок.
 *     Если у элемента нет id (activity-pins/marathon) — берём его позицию в массиве
 *     (индекс + 2: заголовок + 1-based). Не нашли элемент вовсе — where = «—».
 *   • Исключение «Люди»: строку не считаем (порядок людей не привязан к строкам так
 *     наглядно), показываем сам id — он подсказывает человека: where = «id <X>».
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* Манифест → лист + где искать строку. feed: [файл, ключ-массива]; null = людей
 * не резолвим по строке (показываем id), либо элемента-ленты нет (embedded). */
const MAP = {
  'feed-media':          { sheet: 'Посты',         feed: ['data/feed.json', 'posts'] },
  'q3-media':            { sheet: 'Q3-посты',      feed: ['data/q3-feed.json', 'posts'] },
  'tribune-media':       { sheet: 'Трибуна',       feed: ['data/tribune-feed.json', 'posts'] },
  'activity-feed-media': { sheet: 'lenta-activity', feed: ['data/activity-feed.json', 'posts'] },
  'activity-pins-media': { sheet: 'Вокруг нас',    feed: ['data/activity-pins.json', 'pins'] },
  'around-you-media':    { sheet: 'Вокруг нас',    feed: ['data/activity.json', 'activities'] },
  'people-media':        { sheet: 'Люди',          feed: null, byId: true },
  'profile-media':       { sheet: 'профиль',       feed: ['data/profile-posts.json', 'posts'] },
  'clips-media':         { sheet: 'Клипы',         feed: ['data/clips.json', 'clips'] },
  'marathon-media':      { sheet: 'Марафон',       feed: ['data/marathon.json', 'entries'] },
  'gifts-media':         { sheet: 'Подарки',       feed: ['data/gifts.json', null] },
  'stories-media':       { sheet: 'Сториз',        feed: ['data/stories.json', 'stories'] },
  // embedded-media — это локализация статичных ссылок в HTML (scripts/localize-static-media.mjs),
  // а не лист таблицы. Лист подсказать нельзя → даём общий ярлык, строку не ищем.
  'embedded-media':      { sheet: 'Встроенные медиа', feed: null },
};

/** Безопасно читает JSON-файл. Любая ошибка → null (модуль не должен падать). */
function readJsonSafe(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return null; }
}

/** Числовой суффикс id (post-13 → 13, story-4 → 4, 7 → 7). Нет числа → null. */
function idNum(id) {
  const m = String(id == null ? '' : id).match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

/** Все строковые значения элемента (включая внутри массивов) — для поиска src. */
function fieldStrings(el) {
  const out = [];
  if (!el || typeof el !== 'object') return out;
  for (const k in el) {
    const v = el[k];
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) for (const x of v) if (typeof x === 'string') out.push(x);
  }
  return out;
}

/** Собирает все элементы фид-файла в плоский массив [{ el, idx }].
 *  key=null → файл это объект-словарь массивов (gifts.json по типам). */
function feedItems(root, feedSpec) {
  if (!feedSpec) return [];
  const [file, key] = feedSpec;
  const data = readJsonSafe(resolve(root, file));
  if (!data) return [];
  if (key) return Array.isArray(data[key]) ? data[key].map((el, idx) => ({ el, idx })) : [];
  // gifts.json: { type: [ {id,image,…}, … ], _readme: {…} }
  const out = [];
  for (const k in data) {
    if (k === '_readme' || !Array.isArray(data[k])) continue;
    data[k].forEach((el, idx) => out.push({ el, idx }));
  }
  return out;
}

/** where для одного найденного (или нет) элемента. */
function whereFor(found) {
  if (!found) return '—';
  const n = idNum(found.el && found.el.id);
  if (n != null) return `строка ${n + 1}`;        // header — первая строка
  // нет id (activity-pins/marathon) → позиция в массиве: header(1) + 1-based(idx+1).
  return `строка ${found.idx + 2}`;
}

/**
 * scanDeadLinks(root) → [{ sheet, where, url }] по всем data/*-media.json.
 * Никогда не кидает: проблемные манифесты/записи пропускаются.
 */
export function scanDeadLinks(root) {
  const result = [];
  const itemsCache = new Map();   // feedSpec-файл → плоский список (читаем файл один раз)

  for (const manifestName in MAP) {
    const cfg = MAP[manifestName];
    const manifest = readJsonSafe(resolve(root, `data/${manifestName}.json`));
    if (!manifest || typeof manifest !== 'object') continue;

    // Список элементов соответствующего фид-файла (для поиска строки).
    let items = null;
    if (cfg.feed) {
      const cacheKey = cfg.feed[0];
      if (!itemsCache.has(cacheKey)) itemsCache.set(cacheKey, feedItems(root, cfg.feed));
      items = itemsCache.get(cacheKey);
    }

    for (const key in manifest) {
      const rec = manifest[key];
      if (!rec || rec.status !== 'dead') continue;
      const url = rec.src || '';
      if (!url) continue;

      let where;
      if (cfg.byId) {
        // «Люди»: строку не считаем — показываем id (ключ манифеста = id человека).
        where = `id ${key}`;
      } else if (items) {
        const found = items.find((it) => fieldStrings(it.el).includes(url));
        where = whereFor(found);
      } else {
        where = '—';
      }

      result.push({ sheet: cfg.sheet, where, url });
    }
  }

  return result;
}
