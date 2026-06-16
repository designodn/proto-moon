# Session Insights — ds-design

Технические инсайты по работе с компонентами DS и прототипами, собранные за сессию.
Практические заметки «как делать правильно» + грабли, на которые наступили.

---

## 1. Компоненты DS: как использовать

### uniCard (`components/uni-card.css`)
- Вертикальная карточка: `wrapper(__size-160|220|320|custom) → card(__has-background __state-enabled) → media + content`.
- `__has-background` даёт заливку/бордер/паддинги контента; без него — прозрачно, контент flush.
- Press-фидбэк уже встроен: `:active/.__clicked → scale(0.98)`.

### uniCell (`components/uni-cell.css`)
- Универсальная строка списка: `wrapper → container(__state-enabled) → cell` (flex-row).
- Слоты: `avatar` (leading) + `uni-cell-additional-content` (flex-column, центр) + правый элемент.
- База `.uni-cell` БЕЗ gap — gap задаётся типом (`__type-activity`) или локально.

### media (`components/media.css`)
- `.media.__aspect-1-1|4-3|16-9|9-16`, img `object-fit:cover`.
- Есть оверлеи: `__type-video/gallery/clip`, `media__play/time/mute/tag`.
- ⚠️ Нет «media с backgroundBlur-подложкой» и «on-image close» как готового варианта — пришлось делать кастомный компонент (см. friend-card).

### header (`components/header.css`)
- `<header class="header __size-xl|l|m|s"><div class="header__title">…</div><div class="header__subtitle">…</div></header>`.
- Пары типографики: `m` → **title-m (17px)** + body-m. Для секционных заголовков уровня «17/title m» — это `__size-m`.

### button-inline (`components/button-inline.css`)
- Текстовая инлайн-кнопка. Размеры 16/20/24/32, view primary/secondary/tertiary.
- ⚠️ **Иконочная button-inline в навбаре «прыгает»**: база `display:inline-block`, внутри `inline-flex`-контент с `<img>` → baseline-зазор, иконка сидит неровно. Фикс (скоуп `.nav-bar`):
  ```css
  .nav-bar .button-inline { display:flex; align-items:center; justify-content:center; height:100%; }
  ```

### button-circle (`components/button-circle.css`)
- Круглая кнопка, размеры 16/20/24/36/44/56. Иконка через `.icon.__src` (mask + currentColor).
- Подходит для FAB: `button-circle-wrapper __size-56 __style-primary`, позицию (fixed) задаёт обёртка снаружи.

### avatar (`components/avatar.css`)
- Размеры: 16/20/24/36/44/56/72/96/120/144 — **48 НЕТ** (берём 44 или 56).
- Кольца историй: `__ring-active` (оранж) / `__ring-viewed` (серое); outline не занимает место → орбиту выносим через `margin`.
- Добавлен общий press-бамп: `:active/.__clicked → scale(0.95)` (timing как у кнопок).

### meshok-up (`components/meshok-up.css`)
- Шапка: `status-bar + nav-bar + tabs`. Сам `.meshok-up` — `display: contents` (свой box убран), чтобы дети попали в поток scroll-контейнера страницы.
- **Sticky только у `.status-bar`** (`position:sticky; top:0`) — он всегда виден; `nav-bar` и `tabs` уезжают вверх со скроллом. Высота статус-бара опубликована на `:root` как `--status-bar-height` (44px), чтобы оверлеи (heads-up уведомления и пр.) отстраивались от неё.
- Фон `.status-bar`/`.nav-bar` — `--dynamic-surface-base-secondary`, **зафиксирован `!important`** (на странице переопределять нельзя). DS-вариант `nav-bar.__type-publish` — `transparent !important`, чтобы не проигрывать базе.
- 📌 Инсайт: прозрачность шапки нельзя ставить только на контейнер — дети красят свой фон; и если цвет должен быть «железным», фиксируй `!important`, а исключения делай тоже `!important`-вариантами (а не ad-hoc на странице).

### tabbar (`components/tabbar.css` + `components/tab-bar.js`)
- Навигация вынесена в компонентный скрипт: карта `__slot-* → страница` + приоритет `data-href`; активная вкладка `__state-on` не реагирует.
- Свайп вверх по `.tabbar__handle` (> 40px) → `start.html` (имитация home-indicator).
- Заводя новый экран, добавь маршрут в `ROUTES` в `tab-bar.js` (напр. `book: 'tribune.html'`) — иначе тап по табу ничего не делает.

### chips (`components/chips.css`)
- Семейство: `.chips-view → .chips-view__row(.__nowrap) → .chip-container` (с текстом) **или** `.chip-icon-container` (только иконка).
- Размеры: `__size-default` (44h) / `__size-large` (56h). Border-radius = высота/4.
- Views: `__view-primary` (нейтральный) + `__selected-primary` (тёмный фон, inverse-текст). Для брендового — `__view-custom __selected-custom` + 4 переменные инлайн:
  ```
  style="--chip-background-color: ...; --chip-color-custom: ...;
         --chip-background-selected-color: var(--static-surface-status-accent);
         --chip-selected-color: #fff;"
  ```
- Press уже встроен: `:active/.__clicked → scale(0.95)` + overlay-вспышка через `::after`.
- Типографика **title-m (17/24/600) вшита в компонент** — не нужно вешать `ds-title-m` на каждый чип.

### vibe (`components/vibe.css`)
- Empty-state / результат запроса: иллюстрация + title + subtitle + опц. кнопки.
- Контексты `.vibe.__context-page|island|float` задают max-width и предполагаемые размеры детей (illustration 112/96/96, title 27b/21b/17b).
- Структура: `.vibe-wrapper → .vibe.__context-* → .vibe__illustration/title/subtitle/buttons`.
- ⚠️ В скролл-контейнере типа `.phone-frame__feed` (`flex-direction:column`) первый «остров» с vibe **схлопывается** из-за дефолтного `flex-shrink:1` и клипа `.island{overflow:hidden}`. Лечится `flex-shrink: 0` на обёртке секции.

### text-feed: расширенные стили body
- `.__poem` / `.poem` — Source Serif Pro, 24/28, letter-spacing 0.24, 400, **clamp 4 строки + ellipsis**.
- `.__news` / `.news` — Roboto Regular, 24/28, letter-spacing 0.24, 400, **clamp 4 строки + ellipsis**.
- Клэмп зашит прямо в стиль через `-webkit-line-clamp:4` (display:-webkit-box + overflow:hidden + text-overflow:ellipsis). На странице ничего настраивать не нужно.
- Для poem нужен `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+Pro:wght@400">` в `<head>` страницы.

### nav-bar.__type-search (в `meshok-up.css`)
- Шапка с поисковым полем: `back + .text-input __size-36 + button-inline (фильтр)`. Используется в Трибуне.
- Поисковое поле растягивается (`flex:1`); leading/trailing — `flex-shrink:0`. Иконка лупы — позиционируется абсолютно в `.nav-bar__search-icon`, текст-input получает левый паддинг 40px.

---

## 2. Кастомные компоненты (когда DS не покрывает)

- **friend-card** (`components/friend-card.css`) — карточка «Возможные друзья» в ленте: full-bleed квадратное фото + blur-подложка + крестик поверх фото.
- **vvz-card** (`components/vvz-card.css`) — карточка «Возможно, вы знакомы» в сообщениях: круглый аватар по центру + «×» в углу + текст по центру.
- **message-cell** (`components/message-cell.css`) — строка диалога на базе uni-cell.

📌 **Инсайт:** одинаковая по смыслу сущность (ВВЗ) может требовать ДВУХ разных компонентов, если лейаут в макетах отличается. Важно не делать их «одним общим» — держим раздельно (`friend-card` ≠ `vvz-card`).

📌 Кастомный компонент всё равно стоит на DS-примитивах (`.button`, `.avatar`), а типографику вешаем классами `.ds-*` в разметке.

---

## 3. Текст и усечение (ellipsis)

- `text-overflow:ellipsis` срабатывает только на блочном/inline-block элементе с `overflow:hidden; white-space:nowrap`. **На `inline-flex` к тексту НЕ применяется** → текст надо обернуть в отдельный `__text`-спан, который и усекаем.
- Чтобы метаданные (время) **липли к тексту**, а не уезжали к краю: превью `flex: 0 1 auto` (не `1 1 auto`). При `1 1` превью растягивается и толкает время вправо.
- Не вставляем «…» руками — пусть многоточие появляется само при достижении края.

---

## 4. Системный переход между экранами (View Transitions)

`components/screen-transition.css` + `.js`.

- Кросс-документный переход: `@view-transition { navigation: auto; }` (в `index.css`, значит у всех страниц с ним).
- ⚠️ **Самописная transform-анимация `.phone-frame` даёт рывок** — особенно при возврате на bfcache-страницу: кадр в исходной позиции → скачок в офсет. Нативный VT этого лишён.
- Направление (push/pop) делаем через класс **`html.nav-back`**, а НЕ через `viewTransition.types` — types в кросс-документном переходе ненадёжно доезжают до входящего документа.
- ⚠️ **Тайминг — главный грабли:** `pagereveal` одноразовый и фаерится очень рано (~84мс, до первой отрисовки). Listener надо вешать синхронным `<script src>` **в `<head>`**. Скрипт в конце `<body>` (и `defer`) опаздывает → класс не ставится → back играет forward.
- Направление определяем: флаг в `sessionStorage` (ставит клик по `.nav-bar__back`) + фолбэк через Navigation API (`activation.navigationType === 'traverse'`, сравнение `from.index`/`entry.index`).
- z-index: при pop уезжающий старый экран должен быть ПОВЕРХ (`html.nav-back ::view-transition-old(root){ z-index:2 }`).
- Уважаем `prefers-reduced-motion`.

---

## 5. Единый компонент «Назад»

- Канон: `.nav-bar__back` = `button-inline __size-24` + иконка-слот `.icon __size-24 __slot-back` (DS mask-иконка, перекрашивается через currentColor). Поведение и анимацию даёт `screen-transition.js` (`history.back()` по умолчанию, опц. `data-href`).
- На странице ничего не прокидываем — достаточно класса `.nav-bar__back` в навбаре + `screen-transition.js` в `<head>`.
- Используется одинаково в `messages.html`, `tribune.html`, `notifications.html`.

---

## 6. Скрытие строки карточек — компонент `dismissible`

Закрытие/схлопывание вынесено в **общий** компонент `components/dismissible.{css,js}`
(используется и в VVZ-блоке сообщений, и в friend-card-блоке ленты — не дублируем логику):

- `data-dismiss-row` — контейнер-строка; `data-dismiss-target` — карточка;
  `data-dismiss` — закрыть ближайшую карточку; `data-dismiss="row"` — закрыть всю строку.
- Закрыли последнюю карточку → строка тоже схлопывается.
- Затухание `ease-in-out 500ms` (opacity + лёгкий scale).
- **Плавное «подъезжание» нижних ячеек:** фиксируем `height` контейнера в px, затем в
  `requestAnimationFrame` анимируем `height/padding/margin → 0`. Просто `display:none`/`remove()` даёт скачок.

📌 Инсайт: одинаковое поведение в двух местах (лента + сообщения) → выносим в один
behaviour-компонент с `data-*`-хуками, а не копируем скрипт по страницам.

---

## 7. Иконки

- DS-иконки в `assets/icons/` — залитые `fill="black"`, viewBox 24. Как `<img>` **не наследуют currentColor** (для перекраски — CSS-фильтр `brightness(0) invert(1)` для белого).
- Шеврон ≠ стрелка: в макетах рядом с тайтлом — тонкий **chevron** («⌄», без стебля), а не `arrow_down` (со стеблем). Завели `chevron_down_24.svg`.
- Звонок в макете — **контурный** (outline), а не залитый: завели `call_24.svg` (stroke).
- Навбар держим целиком на ассетных иконках (без инлайновых SVG).
- 📌 **Перекраска иконки внутри активного чипса (или другого «inverse» состояния)**: иконка остаётся `<img>` (исходные цвета по умолчанию), а в selected-варианте добавляем инлайн `style="filter: brightness(0) invert(1)"` — чёрный SVG → белый. Альтернатива (mask с currentColor) тоже работает, но требует замены `<img>` на `<span class="icon __src" style="--icon-src:url(...)">`, что не всегда нужно.
- `.icon.__slot-back` → `back_24.svg`: канонический слот для back-кнопки, используется везде вместо «голого» `<img>`.

---

## 8. Lottie

- Анимация «Класс!» по тапу на лайк: `lottie-web` (CDN) + оверлей `assets/lottie/like.json`, проигрывается при постановке лайка (checkbox checked), удаляется по `complete`.
- **Центрирование оверлея** — по видимой `.button-container` (а не по `<label>`, который шире из-за иконки+счётчика) + `transform: translate(-50%,-50%)`.

---

## 9. Токены (важные значения, светлая тема)

| Токен | Значение |
|---|---|
| `--dynamic-surface-base-secondary` | белый (#fff) — фон карточек/шапки |
| `--dynamic-surface-base-tertiary` | `#F7F4F2` — фон карточек ВВЗ |
| `--dynamic-text-and-icons-base-primary` | основной текст |
| `--dynamic-text-and-icons-base-secondary` | `rgba(46,47,51,0.88)` — текст превью |
| `--dynamic-text-and-icons-base-tertiary` | `rgba(46,47,51,0.64)` — время/приглушённое |

- Типографика — классами `.ds-title-* / .ds-body-* / .ds-caption-*`.
- Стандартный timing интерактива: `transform 500ms cubic-bezier(0, -0.3, 0.5, 1.3)`, press = `scale(0.95)` (кнопки/аватар) / `scale(0.98)` (карточки).

---

## 10. Системные уведомления (`components/system-notifications.{css,js}`)

- Декларативный автостарт — три тега и работает:
  ```html
  <link rel="stylesheet" href="components/system-notifications.css">
  <div class="notifs" id="notifs" data-autostart data-mode="heads-up"></div>
  <script src="components/system-notifications.js"></script>
  ```
- Два режима раскладки через BEM-модификатор контейнера:
  - `.notifs.__mode-lock` — плоский вертикальный список (Android lock-screen, gap 8px).
  - `.notifs.__mode-heads-up` — iOS-style колода: новая поверх, прошлые уезжают вглубь (translateY + scale + opacity по depth).
- Per-item конфиг в массиве `NOTIFS` (можно подменять через `OkNotifs.setItems(arr)`):
  `sender`, `time`, `body`, опц. `delay` (ms до показа), `lifetime`, `image` (превью 36×36), `appIcon` (HTML/URL отправителя; дефолт — `appLogoDefault.png`).
- Стрим живёт в `sessionStorage` (`ok_notif_idx`, `ok_notif_next_at`) → **переживает** lock/unlock/back-to-lock без сброса. Чистить стейт UI-обработчик НЕ должен (тoлько `OkNotifs.clearShown()`, не `stop(true)`).
- Программные триггеры: `OkNotifs.fire(itemOrIndex)` — показать СЕЙЧАС вне расписания; `OkNotifs.fireNext()` — продвинуть стрим на следующий немедленно. Удобно для демо-скриптов.
- 📌 Инсайт: «компонент с режимами раскладки + декларативный `data-*` API + per-item конфиг массивом» — пригоден к переносу в любой прототип. Никаких булевых JS-пропсов — всё в HTML/массиве.

---

## 11. App-launch, lockscreen, back-trap — переход с лаунчера в приложение

### `components/app-launch.{css,js}`
Тап `[data-launch="<url>"]` → копия иконки летит в центр, расплывается в блюр и гаснет; одновременно фон сплеша раскрывается circular-reveal'ом из точки тапа; в центре из блюра проявляется splash-логотип.

- DOM: триггер `<button data-launch="lenta-q3.html">…</button>` + общие оверлеи `#launch` (`.launch + .launch__glyph`) и `#splash` (`.splash + .splash__logo`) один раз на страницу.
- Иконка ищется по селектору `.app__icon` внутри триггера (переопределяется `data-launch-icon-sel`).
- Hooks: `app-launch:start` / `:done` на `document` — хост ставит свои sessionStorage-флаги (например, `okstart_at_home=1`).
- Brand-визуал (оранжевый градиент `.splash`, фирменный шрифт `.splash__subtitle`) — оставляем inline на странице. Каркас и анимация — в компоненте.
- ⚠️ **Грабля №1: `transition:` shorthand в двух классах дерётся.** Если у `.is-animating` и `.is-faded` обе пишут `transition:` shorthand — побеждает последняя по cascade, transition-список не объединяется. Решение в компоненте: **полный** список свойств в `.is-faded` (включая `top/left/width/height`), не только новые.
- ⚠️ **Грабля №2: single rAF мало.** Между добавлением `.is-animating` (opacity 1) и `.is-faded` (opacity 0) нужен реальный paint — иначе оба class-add'а в одном style recalc, opacity 0 без transition. Решение: **double-rAF** (rAF внутри rAF).
- ⚠️ **Грабля №3: `brightness(0) invert(1)` схлопывает все непрозрачные пиксели в один цвет.** PNG-плитка с белыми буквами на оранжевом → один белый квадрат. Если нужны только буквы — отдельный PNG с прозрачным фоном или `mask-image`.

### `components/lockscreen.{css,js}`
Pixel-style локскрин + swipe-up разблокировка. Компонент ТОЛЬКО эмитит `lockscreen:unlock` на `document` — хост сам делает `.unlocked` класс, `history.pushState`, нотификации и т.п.

### `components/back-trap.js`
«Back с этой страницы всегда уводит на target, какая бы ни была история».
```html
<script src="components/back-trap.js" data-target="start.html"></script>
```
Пушит sentinel-state, в popstate стреляет `back-trap:before-navigate` (хост успевает выставить sessionStorage) и делает `window.location.replace(target)`.

📌 **Архитектурный паттерн всех трёх:** компонент знает только структуру и анимацию, не знает про конкретный flow страницы. Лайфсайкл-склейка — через `CustomEvent` на `document`. Brand-overrides — inline у хост-страницы.

---

## 12. screenshot-testing агент с persistent memory

- `.claude/agents/screenshot-testing.md` (`model: opus, effort: high, color: cyan, memory: project`).
- `memory: project` → автоматически инжектится `.claude/agent-memory/screenshot-testing/MEMORY.md` (первые 200 строк / 25 KB) в системный промт каждого прогона. Файл коммитится в git → знания шарятся в команде.
- Агент сам поднимает `python3 -m http.server`, пишет Playwright-скрипт, имитирует жесты, мерит computed styles + `sessionStorage`, шлёт скриншоты пользователю.
- Перед коммитом проверять интерактив через агент — он ловит регресс, которого нет в коде (например, opacity иконки = 0 во всех кадрах при «работающем» CSS).
- 📌 **Поле `tools` лучше НЕ задавать** — subagent тогда наследует все инструменты родителя, включая env-specific (`SendUserFile`). Если списком — `SendUserFile` (нет в официальном tools-reference) может быть проигнорирован.
- ⚠️ **Грабли тестирования:** `addInitScript(() => sessionStorage.clear())` срабатывает на КАЖДОЙ навигации, стирает `okstart_at_home` ровно до того, как start.html прочитает его на pageshow → ложный FAIL. Чистить storage ВНЕ Playwright-скрипта или новым контекстом.

---

## 13. Процесс разработки компонентов

- 📌 **`grep -rn '<имя-класса\|aria-label>' components/` ПЕРЕД написанием нового компонента.** В этом репо легко продублировать поведение — был кейс «написал `back-button.js`, не глядя что `screen-transition.js` уже централизованно ловит `.nav-bar__back`». Удалил со стыдом.
- При выносе в компонент: брэнд-специфичные стили (цвета, шрифт) оставляем inline на странице. Каркас + анимация + поведение — в компонент. Принцип «компонент пригоден к brand-override».
- Long-running ветка ловит конфликты на каждом merge main → если ясно, что итераций ≥5 — лучше частые `merge origin/main` в свою ветку (или `merge -X ours` для тривиальных пересечений), чем стопка PR с одинаковыми резолюшнами.
- `screenshot-testing` агент верифицирует рефакторы, где сложно поверить «по диффу» — снимет скриншоты ключевых моментов и подтвердит эквивалентность поведения.

---

## 14. Окружение и процесс (техничка)

- `figma.com` закрыт network-allowlist окружения → `curl`/`WebFetch` к ассетам Figma не работают (403 / Host not in allowlist). MCP отдаёт **ссылку/превью, а не байты**.
- Картинка, **вставленная в чат текстом**, на диск не сохраняется (байтов нет). Нужно прикладывать **файлом-вложением** — тогда попадает в `assets/icons/` (так доехали `splashLogo.png`, `bannerBack1.png`).
- Иногда файлы приезжают в корень репо — переносим в `assets/icons/`.
- ⚠️ **Регистр имён файлов важен**: PNG может приехать как `Resourses.png`, а ссылка в HTML — на `resourses.png`; Linux/raw.githack case-sensitive → 404 + срабатывает `onerror`-фолбэк, и кажется, что асссет «не приехал». При втыкании ссылки на ассет — сверять регистр через `ls`.
- Параллельные правки/переименования в репозитории случаются (напр. `lenta-light.html` → `lenta-q3.html`); при слиянии используем `merge -X ours` и проверяем, что ссылки (`tab-bar.js` ROUTES, навигация) согласованы и нет битых путей.
- 📌 **Главред-агенты** (Figma MCP, GitHub MCP) подключаются с задержкой — если их инструменты ещё не появились в начале сессии, их схемы догружаются через ToolSearch по мере нужды.
- Интерактив/анимации/последовательности переходов проверяем реальным прогоном в браузере (Playwright/Chromium-агент): измеряем computed styles, `getAnimations()`, `sessionStorage`, снимаем кадры середины перехода — юнит-тест это не ловит.

---

## Карта живых экранов (GitHub Pages)

- `start.html` — лаунчер: локскрин → меню → сплеш ОК → лента.
- `lenta-q3.html` — основная лента (бывший `lenta-light.html`).
- `messages.html` — сообщения. `notifications.html` — уведомления. `tribune.html` — трибуна.
- `lenta.html` — десктоп-превью собранной ленты. `preview.html` — витрина примитивов/молекул.
