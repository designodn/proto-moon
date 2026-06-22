# ds-design

Зеркало дизайн-системы ОК для прототипирования.
Источник: `gitlab.corp.mail.ru/ok/ODKL/odnoklassniki-frontend-common` + `@ok/ds-tokens`.

---

## Структура

```
ds-design/
├── index.css                   # точка входа — импортирует всё
├── tokens.css                  # CSS custom properties
├── fonts.css                   # OK Sans @font-face (опционально)
├── animations.css              # keyframes + transition-хелперы
├── fonts/                      # OK Sans Display / Text (otf, ttf)
└── components/
    ├── button.css              # Button (56/44/36/28, 6 стилей, состояния)
    ├── button-inline.css       # ButtonInline (текстовая кнопка, 4 размера)
    ├── icon.css                # Icon (svg wrapper, 12–56px)
    ├── uni-cell.css            # UniCell (строка списка)
    ├── uni-card.css            # UniCard (вертикальная карточка)
    ├── content.css             # Content (flex-layout)
    ├── contents-view.css       # ContentsView (вертикальный контейнер)
    │
    ├── avatar.css              # Avatar (24–56px, image / initials)
    ├── pulse-dot.css           # PulseDot (анимированный индикатор)
    ├── category-path.css       # CategoryPath (хлебные крошки)
    ├── feed-base.css           # FeedBase (карточка ленты)
    ├── feed-tabs.css           # FeedTabs (большие табы сверху)
    ├── tab-bar.css             # TabBar (нижняя навигация)
    ├── page-header.css         # StatusBar + NavBar
    ├── comment-input.css       # CommentInput (поле + кнопка отправки)
    └── phone-frame.css         # PhoneFrame (375px-viewport для превью)
```

---

## Подключение

```html
<html class="__ui-theme_enabled __ui-theme_light">
<head>
  <link rel="stylesheet" href="index.css">
</head>
```

Тёмная тема: `__ui-theme_dark` вместо `__ui-theme_light`.

Открой `preview.html` в браузере — там собраны примитивы, молекулы (как
композиции примитивов) и собранный экран ленты в `phone-frame`.

Чтобы использовать OK Sans вместо Onest, переопредели `--font-family`:

```css
:root {
  --font-family: "OK Sans Text", "OK Sans Display", Onest, sans-serif;
}
```

---

## Реальные люди из Google-таблицы

Аватарки и имена реальных людей берутся из Google-таблицы [«люди»](https://docs.google.com/spreadsheets/d/1Ctwjp2J0HSmvb6kL4NoDqaB9W4QfdAXXDnzyBDLYZ7Y/edit),
лист **«Люди»**. Пайплайн — оффлайн: скрипт выкачивает таблицу в статический
JSON, который коммитится в репо (интернет нужен только при обновлении данных).

**Обновить данные** (таблица должна быть открыта «всем, у кого есть ссылка»):

```sh
node scripts/fetch-people.mjs
# → перезапишет data/people.json и data/people.js
```

**Подключить на странице** (после разметки):

```html
<script src="data/people.js"></script>          <!-- window.DS_PEOPLE_DATA -->
<script src="components/people-data.js"></script>
```

**Разметка** — человек подставляется по `id` из листа «Люди»:

```html
<img data-person-avatar="3" alt="">                  <!-- аватар -->
<div data-person-name="3">…</div>                    <!-- имя -->
<div class="vvz-card__blur" data-person-bg="3"></div> <!-- фон-блюр -->
```

`media: "video"` (живое фото) аппликатор сам подменяет `<img>` на зацикленное
`<video>`. Спец-`id` **`my_profile`** — текущий пользователь: его подхватывает
`components/user-data.js` (`data-user-*`, а также `data-pr-*` в NV-профиле).

**Блоки «Возможно, вы знакомы»** размечены людьми с id `vvz-1`…`vvz-4` (отдельные
строки в листе «Люди»). Раскатка по всем ВВЗ-блокам — разовым скриптом:

```sh
node scripts/wire-vvz.mjs
```

Он проставляет `data-person-*` на карточки `.vvz-card` / `.friend-card` (в колодах
длиннее 4 — по кругу) и подключает скрипты people. Блок «Давно не общались»
(`dnoBlock`) пропускается — это существующие контакты, а не подсказки знакомств.

Примеры в коде: `friends.html`, `profile.html`, `guests.html`, `lenta.html`,
`lenta-q3.html`, `messages.html` (блок «Возможно, вы знакомы»), `menu.html`,
`new-vision/profile.html` (профиль владельца).

---

## Конвенция именования

Все интерактивные компоненты следуют паттерну `wrapper → container`:

```html
<div class="button-wrapper __size-36 __style-primary">
  <button class="button-container __style-primary">
    <span class="button-content">Кнопка</span>
  </button>
</div>
```

Модификаторы:
- `__size-N` — высота / тайпография
- `__style-X` / `__view-X` — визуальный вариант
- `__state-enabled` / `__state-disabled` / `__state-loading` / `__state-dragged` — поведение
- `__clicked` — синоним `:active`, можно ставить из JS

---

## Маппинг Lenta-прототипа → DS-компоненты

| Класс в прототипе | Заменяется на | Состояния |
|---|---|---|
| `.btn-sec` | `.button-wrapper.__size-28.__style-secondary` | hover / press / disabled / loading |
| `.btn-sub` | `.button-wrapper.__size-28.__style-secondary` | `+ .__style-primary` когда подписан |
| `.btn-sub.on` | `.button-wrapper.__size-28.__style-primary` | — |
| `.join-btn` | `.button-wrapper.__size-44.__style-primary.__full-width` | + loading при отправке |
| `.nb-btn`, `.adots`, `.c-back` | `.button-wrapper.__size-36.__style-tertiary` + `.icon` | hover / press |
| `.c-send` | `.button-wrapper.__size-36.__style-primary` (border-radius: 50%) | disabled когда поле пустое |
| `.abtn` (like / comment / klass) | `.button-wrapper.__size-36.__style-secondary` + иконка + счётчик | liked-состояние = filled-иконка (`klass_filled_*`) |
| `.cmt-like` | `.button-inline.__size-16.__view-tertiary` | hover (opacity 0.84) |
| `.ar-row` | `.uni-cell-wrapper.__state-enabled` | hover / pressed |
| `.cmt` | `.uni-cell-wrapper` | — |
| `.join-card` | `.uni-card-wrapper.__size-custom.__state-enabled` | image-zoom on hover |
| `.pava`, `.ar-ava`, `.nb-ava`, `.cmt-ava` | `.avatar.__size-32/36/40/44` | loading / disabled |
| `.ar-dot` | `.pulse-dot.__view-accent` | paused |
| `.pcat` | `.category-path` | — |
| `.post` | `.feed-base` композиция: header = `.uni-cell-wrapper` + `.avatar` + `.button-wrapper`; actions = ряд `.button-wrapper.__size-36.__style-secondary` | loading |
| `.tabs` + `.tab` | `.feed-tabs` + `.feed-tabs-tab.__state-on` | on / disabled / clicked |
| `.tbar` + `.tbi` | `.tab-bar` + `.tab-bar-item.__state-on` | on / disabled |
| `.sb` | `.status-bar` | — |
| `.nb` | `.nav-bar` | — |
| `.c-bar` | `.comment-input` | focused / disabled |
| `.phone` | `.phone-frame` | — |

---

## Анимации

Все интерактивные состояния используют один timing:

```
transition: [property] 500ms cubic-bezier(0, -0.3, 0.5, 1.3)
```

| Состояние | Поведение |
|---|---|
| `:hover` | overlay opacity 0.12 |
| `:active` / `.__clicked` | overlay 0.16 + `scale(0.95)` |
| `.__state-loading` | shimmer sweep 2.5s |
| `.__state-highlighted` | diagonal light sweep 1.2s |
| `.__state-dragged` | box-shadow + `scale(0.98)` |
| `.__state-disabled` | opacity 0.36, no pointer events |

---

## Типографика

| Класс | Size / LH / Weight |
|---|---|
| `.ds-display-xl` | 56 / 72 / 500 |
| `.ds-title-xl`   | 27 / 28 / 600 |
| `.ds-title-l`    | 21 / 28 / 600 |
| `.ds-title-m`    | 17 / 24 / 600 |
| `.ds-title-s`    | 15 / 20 / 600 |
| `.ds-body-l`     | 17 / 24 / 400 |
| `.ds-body-m`     | 15 / 20 / 400 |
| `.ds-caption-m`  | 13 / 16 / 400 |
| `.ds-caption-m-accent` | 13 / 16 / 600 |
| `.ds-caption-s`  | 11 / 16 / 400 |

---

## Иконки

В репо лежит набор SVG, вытащенных из Lenta-прототипа, под `assets/icons/`.
Все иконки используют `currentColor`, чтобы перекрашиваться через CSS.

| Файл | viewBox | Назначение в прототипе |
|---|---|---|
| `star.svg` | 24×24 | Like / Класс! (filled-on-press) |
| `comment.svg` | 24×24 | Открыть комментарии |
| `thumb-up.svg` | 24×24 | Класс (thumb-up reaction) |
| `dots-horizontal.svg` | 24×24 | Меню «Ещё» |
| `plus.svg` | 24×24 | Создать пост |
| `bell.svg` | 24×24 | Уведомления |
| `search.svg` | 24×24 | Поиск |
| `arrow-left.svg` | 24×24 | Назад (в шторке) |
| `send.svg` | 24×24 | Отправить комментарий |
| `play.svg` | 24×24 | Play-overlay на видео |
| `info-circle.svg` | 24×24 | Иконка-аватар «ОК Новости» |
| `chevron-right.svg` | 8×13 | Шеврон в «Вокруг вас сейчас» |
| `settings.svg` | 32×32 | Настройки ленты (sliders) |
| `tab-home.svg` | 32×32 | Bottom tab — Лента |
| `tab-book.svg` | 32×32 | Bottom tab — Дневник |
| `tab-mail.svg` | 32×32 | Bottom tab — Сообщения |
| `tab-video.svg` | 32×32 | Bottom tab — Видео |
| `tab-menu.svg` | 32×32 | Bottom tab — Меню |
| `status-wifi.svg` | 16×12 | Status bar — Wi-Fi |
| `status-signal.svg` | 17×12 | Status bar — сеть |
| `status-battery.svg` | 25×12 | Status bar — батарея |

Использование — два способа:

**1. Inline SVG (полный контроль, рекомендуется для приложения):**

```html
<span class="icon __size-20">
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="…"/></svg>
</span>
```

**2. Внешний SVG через mask (короче, но теряет multi-fill knockouts):**

```html
<span class="icon __size-20 __src"
      style="--icon-src: url('assets/icons/star.svg')"></span>
```

Размеры через `.__size-12 / 16 / 20 / 24 / 28 / 32 / 36 / 40 / 44 / 48 / 56`.

Дополнительно — канонический OK DS набор (~250 иконок) лежит в dev-репо:
`design-system/assets/icons/glyphs/{size}/glyph_{name}_{size}.svg`
