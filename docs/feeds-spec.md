# Спека фидов: Activity-лента и Q3-лента

Самодостаточный контракт для сборки **Activity-ленты** (`activity-lenta/lenta.html`)
и **Q3-ленты** (`lenta-q3.html`). Предназначен для агента, собирающего разделы.

> **Источник истины по типам карточек — один:** `data/q3-feed.schema.json`.
> Обе ленты строит **один генератор** `scripts/fetch-q3.mjs` (объект `FEEDS`
> меняет только источник-лист, json-выгрузку и целевой html). Трибуна — третий
> «дубль» того же генератора, в этой спеке не рассматривается.

---

## 0. TL;DR

| | Q3-лента | Activity-лента |
|---|---|---|
| HTML | `lenta-q3.html` (корень) | `activity-lenta/lenta.html` (подпапка, `<base href="../">`) |
| Лист (gid) | «Q3-посты» `1662648328` | «lenta-activity» `2116709014` |
| Данные | `data/q3-feed.json` | `data/activity-feed.json` |
| Медиа-кэш | `assets/q3/` (`data/q3-media.json`) | `assets/activity/` (`data/activity-feed-media.json`) |
| Генератор | `node scripts/fetch-q3.mjs` | `node scripts/fetch-q3.mjs --activity` |
| Офлайн-реген | `… --offline` | `… --activity --offline` |
| Типы карточек | полный набор (раздел 2) | те же типы |
| Особое | — | **таб-стрип на 6 панелей** (раздел 5), Подборки-Pinterest, «Сегодня», остров «Вокруг вас» |

Spreadsheet ID (все листы): `1Ctwjp2J0HSmvb6kL4NoDqaB9W4QfdAXXDnzyBDLYZ7Y`

---

## 1. Базовые принципы рендера

- **Карточка = ОБЁРТКА + слоты по `type`.** Обёртка — `article.text-feed.island`
  или спец-класс типа. Слот, которого нет в данных, генератор **не рисует**
  (а не оставляет пустым).
- **CTA и actions-bar зашиты в шаблон по типу.** В данных — только числовые
  счётчики `stats` и текст особых CTA (повод подарка и т.п.).
- **Авторы резолвятся из «Люди».** Имена/аватары — по `id` из листа «Люди»
  (`data/people.js` + `components/people-data.js`). Людей держи актуальными ДО
  сборки лент, иначе имена/авы пустые. Спец-id: `my_profile` (текущий юзер),
  `group-N` (сообщество), `vvz-N` (возможно знакомы), `ad-N` (рекламодатель).
- **Типографика — автоматом.** Заголовок/текст/описание/комменты прогоняются через
  `nbsp()`: короткие предлоги/союзы из `HANG_WORDS` приклеиваются к следующему
  слову неразрывным пробелом.
- **Токен имени:** `<id>_name` (напр. `my_profile_name`) в заголовке/тексте →
  подставляется имя человека (только имя).
- **Генерируемые блоки перетираются.** Ручные правки между `<!-- FEED:START … -->`
  и `<!-- FEED:END -->` затрёт следующий прогон — меняй данные в листе или шаблон
  в скрипте.

---

## 2. Каталог типов карточек

Колонка «тип» в листе. `text/photo/photo-gallery/video` — это **один компонент**
`feed-text`; различие только в слоте `media`. `text-long`/`text-gallery` отдельными
типами НЕ выделяются.

| тип | автор | слоты / поля | stats | примечание |
|---|---|---|---|---|
| `text` | да | `text {value, clamp?}`, media=none | да | база `feed-text`. `clamp:true` прячет хвост под «ещё». `entity:group` → групповой пост |
| `photo` | да | `text`, media=image (1 фото) | да | тот же `feed-text` |
| `photo-gallery` | да | `text`, media=gallery (N фото) | да | тот же `feed-text` |
| `video` | да | `text`, media=video | да | тот же `feed-text` |
| `ad` | рекламодатель | `text`, media=image | нет | реклама. Автор inline (`name/initials/subtitle "Реклама 0+"`), CTA «Перейти» из шаблона, счётчиков нет |
| `group-post` | группа | `text`, media=none\|image\|gallery | да | = `feed-text` + `entity:group` (автор `group-N`): «Подписаться» + бейдж «Сообщество» из шаблона. Подписка ТОЛЬКО у авторов-сообществ |
| `vvz-portlet` | — | `cards[] {personId, name, subtitle}` | — | ряд «Возможно, вы знакомы» + финальная help-карточка; CTA «Дружить» |
| `on-this-day` | self | `title`, `reshareCard {author, text, media}`, `likes {avatars[], text}` | — | бейдж «Видите только вы», CTA «Поделиться» |
| `reshare-group` | да | `reshareFrom {name, avatar}`, `text`, media=image | да | репост из группы |
| `reshare-post` | да | `innerPost {author, text(clamp), media}` | да | вложенная карточка с бордером |
| `added-friend` | да | `text`, `friend {name, verified, avatar, subtitle, mutuals[]}` | — | friend-row: большой аватар, verified, общие друзья, CTA «Добавить в друзья» |
| `shared-link` | да | `text`, `link {url, image, title, description, domain}` | да | превью ссылки |
| `gift-received` | да | `gift {caption, from{name,avatar}, media}`, `variant: postcard\|gift` | — | повод + даритель + медиа; CTA по подписи |
| `ai-gift-received` | да | `gift {…}` | — | как `gift-received`, но кнопка `__style-ai-gift` (градиент) + подложка `#FFEFE5`, CTA «Создать ИИ подарок» |
| `friendversary` | — | `avatars[2]`, `title`, `text` | — | спец-класс `feed-birthday`, CTA «Поздравить друга» |
| `tagged-photo` | — | `heroAvatar`, `title`, media=image, `tag {name, top, left}` | — | full-bleed media + tooltip с именем, CTA «Поделиться» |
| `clip` | да | media=clip (9:16) | да | спец-класс `clip-feed`, тёмные actions |
| `memories-clip` | self | `title`, `label` (=период), `photos[]` (кадры) | — | island «Ваш клип из воспоминаний»: бейдж «Видите только вы», кадры сменяются кросс-фейдом, подпись в OK Sans Display, без звука. Тап → `clip-edit.html` |
| `comment-as-feed` | 2 id `[комментатор, автор оригинала]` | `breadcrumbs (тема/рубрика)`, `commentText`(=заголовок), `origPreview {title, snippet}`, `replies` | да | коммент как карточка. Шапка `feed-header` (крошки + «Комментарий к <автор>»). Крупный текст `.caf-text` 22/26. Превью оригинала. Ветка ОТВЕТОВ. **Рендерится twitter-like (см. §8).** Компонент `components/comment-as-feed.css` |

---

## 3. Общие (опциональные) слоты обёртки

Не привязаны к типу — могут стоять у любого подходящего поста:

- **`activity`** — серая строка «почему пост в ленте» НАД автором, напр.
  `<b>Борис Фрол</b> поставил класс`. Слот `text-feed__activity`.
  *(В сыром листе activity-ленты это колонка `header`.)*
- **`entity`** — флаг `user | self | group`. `group` → автор-сообщество:
  «Подписаться» + бейдж «Сообщество» автоматически. «Групповой пост» — это НЕ
  отдельный тип, а `text/photo/photo-gallery/video` с `entity:group`.
- **`topComment`** — один встроенный комментарий ПОД actions-bar
  (`{name, initials?, color?, avatar?, time, text, likes}`). Может висеть у любого
  text-поста.
- **`марафон`** (колонка «марафон») — хэштег (без `#`, без пробелов). Непустое
  значение у обычного поста → блок `text-feed__marathon` (призыв + счётчик
  «11К участников» + кнопка «Перейти к фотомарафону» → `marathon.html`). Колонка
  «участвую»=«да» → joined-состояние (серая кнопка + «Вы уже участвуете…»).
  Тип `marathon` — отдельный фид «от приложения»: заголовок + веер из 3 фото,
  без автора и actions-bar.
- **`comments` (ветка)** — комменты под actions-bar ЛЮБОЙ карточки (компонент
  `comment-thread`, `ct-*`). Из листа: пары «автор коммента N / текст коммента N»
  (N=1,2). Рисуется только при наличии текста. Каждый — аватар 24px + имя + текст +
  «Ответить · Класс»; ниже «Посмотреть все комментарии» + поле comment-input.
  Клип с комментами рендерится не full-bleed, а островом (медиа 4:3).

---

## 4. Формы полей

```jsonc
// автор (inline у Q3; authorId зарезервирован под унификацию с people.json)
"author": { "name": "Имя/Название", "avatar": "URL", "time": "9:12 | вчера, 18:02 | пн, 12:03" }
// у ad: { name, initials, subtitle: "Реклама 0+", role: "advertiser" }

"text":  { "value": "тело (допускается <br>)", "clamp": true }   // clamp прячет хвост под «ещё»
"stats": { "likes": 34, "comments": 7, "reshares": 2 }           // likes = кнопка «класс»
"media": { "kind": "none|image|gallery|video", "url": "…", "images": ["…","…"] }
```

`type` в листе и `media.kind` связаны 1:1 (`text→none`, `photo→image`,
`photo-gallery→gallery`, `video→video`). У `reshare/gift/clip` медиа — в их
собственных под-объектах. `aspect-ratio` — дефолт шаблона по числу фото.

### Маппинг колонок листа (матч ПО ИМЕНИ заголовка, порядок столбцов свободный)

`id · тип · тема · рубрика · шапка · автор · заголовок · текст · описание ·
фото (через запятую) · лайки · комменты · репосты · ссылка ·
автор коммента 1 · текст коммента 1 · автор коммента 2 · текст коммента 2`

- **id** — ключ строки; порядок строк = порядок в ленте (`post-1`, `row-1`…).
- **тема / рубрика** — крошки `feed-header` (нужны `comment-as-feed`).
- **шапка** — лейбл над карточкой (для клипа-с-комментами «может быть интересно»);
  в сыром виде это `activity`-строка над автором.
- **автор** — id из «Люди»; несколько через запятую (vvz-portlet, added-friend,
  friendversary, gift-received, comment-as-feed).
- **заголовок** — `title` (on-this-day, friendversary, tagged-photo, повод подарка);
  для shared-link — заголовок превью.
- **текст** — тело поста; для shared-link — подводка; для memories-clip — период (`label`).
- **фото** — ссылки через запятую (галерея / одиночное / медиа клипа / кадры монтажа /
  картинка превью).
- **описание** — shared-link: `Заголовок / Подзаголовок` (делится по первому ` / `)
  либо только описание; comment-as-feed: сниппет (2 строки) превью оригинала.
  Если заголовок/описание заданы вручную — авто-фетч og:-меты НЕ дёргается.
- **ссылка** — URL для shared-link (`link.url`).
- **пары автор/текст коммента N** — ветка комментов (см. раздел 3).

### COMPANION (в коде, НЕ в листе)

Вложенные куски, не влезающие в плоские колонки, держатся в объекте `COMPANION`
генератора, привязанные к ТИПУ/id карточки: `subtitle` ВВЗ-карточек, `likes`
on-this-day, друзья/общие added-friend, мета shared-link (title/desc/domain),
вложенный автор reshare-post, повод/вариант gift-received, тег tagged-photo,
медиа clip, fallback-подборка memories-clip, `topComment`, `reshareFrom`,
`activity`, stories-row, banner.

---

## 5. Особенности Activity-ленты

Activity = Q3-контракт + надстройки. **Картинки путей БЕЗ `../`** (как у Q3 в
корне) — потому что страница в подпапке имеет `<base href="../">`.

> ⚠️ Подпапка + `<base href="../">` → работает `components/proto-contain.js`
> (контейнер навигации) и таб-бар. Правила навигации/таб-бара — см. `CLAUDE.md`,
> раздел 2. Эта спека — только про КОНТЕНТ ленты.

### 5.1. Таб-стрип на 6 панелей (`FEEDS.activity.tabs = true`)

Вверху первого НЕ-ВВЗ поста — DS `.tabs`-стрип. Переключение контента НА МЕСТЕ:
видна ровно одна панель (остальные `[hidden]`), стрип «врастает» в первый остров
панели. ВВЗ-портлет рендерится ВЫШЕ панелей (общая шапка). Переключение —
`components/feed-tabs.js` по `.tabs-tab[data-tab]`.

| таб | id | контент |
|---|---|---|
| Лента | `lenta` | `comment-as-feed` из листа |
| Подборки | `podborki` | Pinterest-masonry (чипсы + грид `.uni-card`, тип `pin`) — **отдельный лист** gid `802612828`, кэш `assets/activity-pins/` |
| Сегодня | `segodnya` | виджеты `today.html` (`components/today-widgets.{css,js,partial.html}`) |
| Подарки | `podarki` | `gift-received` / `ai-gift-received` (twitter-like, §8) |
| Друзья | `druzya` | `photo` / `text` / `video` / `friendversary` (twitter-like, §8) |
| Локальное | `lokalnoe` | `comment-as-feed` (как Лента, пока) |

В табах с флагом `tw:true` (Подарки, Друзья) типы рендерятся **компактным
твиттер-рядом** (модификатор twitter-like, §8), КРОМЕ `FULL_CARD_TYPES`
(сейчас `friendversary`) — они даже в tw-табе остаются полной q3-карточкой.

### 5.2. Подборки (Pinterest-таб)

Отдельный лист gid `802612828` (`ACTIVITY_PINS`). Колонки: `id · автор=group-* ·
текст=подпись · фото=URL картинки`. Кэш-выгрузка — `data/activity-pins.json`
(для офлайн-регена), фото — `assets/activity-pins/`.

### 5.3. Остров «Вокруг вас»

`activity-widget` стоит ОТДЕЛЬНО, перед ВВЗ, **ВНЕ** `FEED:START/END`. Его наполняет
`fetch-activity.mjs` (лист «Вокруг нас») — реген ленты его НЕ трогает.

---

## 6. Статика (не из листа)

- **stories** — ряд моментов над фидом. Первый элемент `kind:add` («Ваша история»,
  viewer не открывается). Элемент: `{name, avatar, ring: active|viewed, stories: N,
  bday?, vvz?}`.
- **banner** — картинка-баннер под сторис (опционально), `text` — подпись поверх.

---

## 7. Сборка / реген

```bash
# Q3-лента
node scripts/fetch-q3.mjs                 # из листа «Q3-посты»
node scripts/fetch-q3.mjs --offline       # реген html из data/q3-feed.json (без сети)

# Activity-лента
node scripts/fetch-q3.mjs --activity            # из листа «lenta-activity» (+ Подборки)
node scripts/fetch-q3.mjs --activity --offline  # реген html из data/activity-feed.json
```

Карточки вставляются между `<!-- FEED:START … -->` / `<!-- FEED:END -->` целевого
html. Всё вне маркеров (шапка-остров, таб-бар, «Вокруг вас») — статика, генератором
не трогается.

---

## 8. Модификатор `twitter-like`

Компактная двухколоночная раскладка карточки (`.caf.__twitter-like`, компонент
`components/comment-as-feed.css`) — «твиттер-ряд» вместо полноширинной q3-карточки.

**Структура:**

```
article.caf.__twitter-like.island
├─ (activity-строка над рядом — колонка «шапка», опц.)
├─ (crumbs тема › рубрика — опц.)
└─ caf__row
   ├─ caf__aside    — аватар 44px + caf__line («палка» вниз, если есть тред)
   └─ caf__content  — имя·дата → тело (ds-body-m, инлайн-«ещё») → медиа/цитата
                       → caf__actions (3 счётчика: comment · reshare · klass-outline)
```

- Тело — `ds-body-m` (`cafTextTw`), НЕ крупный `.caf-text`. Счётчики —
  `button-inline 16 tertiary` (`inlineCount`): 0/пусто → только иконка.

**Где применяется:**

1. **Тип `comment-as-feed`** — всегда (родная раскладка типа).
2. **Activity-табы с `tw:true`** (Подарки, Друзья) — НЕ-`comment-as-feed` типы
   (`photo/text/video/gift-received/ai-gift-received`) перерисовываются твиттер-рядом
   через `renderTwitterCard()` вместо полной карточки.

**Механика:**

- **`FULL_CARD_TYPES`** (сейчас `{friendversary}`) — исключение: даже в tw-табе
  рендерятся ПОЛНОЙ карточкой (`renderPost`), а не твиттер-рядом.
- **Единое правило медиа `twMedia(ids, photos)`** для всех twitter-like карточек:
  - 1 автор (нет `ids[1]`) → фото обычным `.text-feed__media` под текстом;
  - 2 автора (`ids[1]`) → оригинал в reshare-контейнере (автор `ids[1]` + опц.
    текст + фото 16:9).
- **Подарок в tw** → `text-feed__reshare-card` с модификатором `__gift` / `__ai-gift`
  (повод + ава/имя дарителя + медиа 1:1).
- **Комменты в tw** → тот же ряд (`fc-comment __twitter-like`), но лейблы
  «комментарии», а не «ответы» (`renderCommentThread(p, {tw:true, replies:false})`);
  «палка» у авы рисуется при наличии треда.

---

## Приложение: пример карточки (структурный JSON, `data/q3-feed.json`)

```jsonc
{
  "id": "q3", "type": "photo-gallery",
  "author": { "name": "Евгения Молчанова", "avatar": "https://…/molchanova.jpg", "time": "вчера, 18:02" },
  "text": { "value": "Дача, конец июля. Розы наконец зацвели…", "clamp": true },
  "media": { "kind": "gallery", "images": [ "https://…/rose1.jpg", "https://…/rose2.jpg" ] },
  "stats": { "comments": 24, "reshares": 5, "likes": 128 }
}
```

Полный набор живых примеров на каждый тип — в `data/q3-feed.json` (`posts[]`)
и машинный контракт со `слот_матрица` — в `data/q3-feed.schema.json`.
