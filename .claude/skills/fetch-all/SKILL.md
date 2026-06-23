---
name: fetch-all
description: Единый сбор обновлений со ВСЕЙ Google-таблицы за один прогон — люди, ленты (New Vision, Q3 и Трибуна), клипы, активности «Вокруг вас», сториз/моменты, марафон, подарки + доразметка ВВЗ. Используй, когда пользователь просит «обновить всё», «перечитать всю таблицу», «синхронизировать всё», «прогнать все листы», «собрать обновления со всей таблицы», или сказал, что поправил несколько листов сразу.
---

# Сбор обновлений со всей таблицы

Один источник на все данные:
Spreadsheet ID: `1Ctwjp2J0HSmvb6kL4NoDqaB9W4QfdAXXDnzyBDLYZ7Y`

Запускает по порядку все fetch-скрипты (люди — первыми, остальные резолвят
людей по id), затем `wire-vvz` (доразметка ВВЗ-карточек на страницах).

## Как обновить всё

```sh
node scripts/fetch-all.mjs
```

Что прогоняется (в этом порядке) и куда пишет:

| Шаг | Лист | Результат |
|-----|------|-----------|
| `fetch-people.mjs`   | «Люди»       | `data/people.json` + `data/people.js` |
| `fetch-feed.mjs`     | «Посты»      | `new-vision/lenta.html` (+ `data/feed.json`) |
| `fetch-q3.mjs`       | «Q3-посты»   | `lenta-q3.html` (+ `data/q3-feed.json`) |
| `fetch-q3.mjs --tribune` | «Трибуна» (gid 803749593) | `tribune.html` (+ `data/tribune-feed.json`) |
| `fetch-profile.mjs`  | «Профили» (gid 877262163) | `profile.html` (+ `data/profile-posts.json`) |
| `fetch-clips.mjs`    | «Клипы»      | `data/clips.json` + `data/clips.js` |
| `fetch-activity.mjs` | «Активности» | виджет/страница «Вокруг вас» |
| `fetch-stories.mjs`  | «Сториз»     | `data/stories.json` + `data/stories.js` |
| `fetch-marathon.mjs` | «Марафон»    | `marathon.html` |
| `fetch-gifts.mjs`    | «Подарки»    | `data/gifts.json` + `data/gifts.js` |
| `wire-vvz.mjs`       | —            | доразметка `data-person-*` на ВВЗ-карточках страниц |

Падение одного шага (нет доступа к листу / сети) не останавливает остальные —
в конце печатается сводка `✓/✗` по каждому шагу.

## Отдельные листы

Если нужно обновить только что-то одно — используй точечные скиллы/скрипты:
`fetch-people`, `fetch-feed`, `fetch-clips`, `fetch-activity`, либо напрямую
`node scripts/fetch-<имя>.mjs`.

## После обновления

- Сверь `git diff` (число постов, баланс `<article>`/`<div>`, отсутствие
  маркеров конфликта в `lenta.html` / `lenta-q3.html` / `marathon.html`).
- Ленты/страницы генерируемые — ручные правки внутри `FEED:START/END` затрёт
  следующий прогон; меняй данные в таблице или шаблоны в скриптах.
- Коммить только по просьбе.
- Опционально: прогнать агента `screenshot-testing` по затронутым страницам.
