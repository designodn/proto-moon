# screenshot-testing memory — proto-moon

## Окружение / запуск
- Сервер из корня репы: `python3 -m http.server 8765 --bind 127.0.0.1`. Страницы new-vision: `/new-vision/okruzhenie.html`, `/new-vision/lenta.html`, `/new-vision/profile.html`.
- Вьюпорт прототипа мобильный 390×844, deviceScaleFactor 2, isMobile+hasTouch.
- Внешние картинки (i.pravatar.cc / picsum) в песочнице НЕ грузятся — плейсхолдеры (серый прямоугольник с иконкой). Это норма, проверять вёрстку/анимации, не фото.

## Структура страниц
- Скролл-контейнер = `.phone-frame__feed` (app-shell.css: 100dvh, overflow:hidden на shell, overflow-y:auto на feed). НО в headless body/feed не клампятся по высоте → `scrollHeight == clientHeight`, `window.scrollTo` и `feed.scrollTop` не двигают. Чтобы снять нижние ячейки: `element.scrollIntoView({block:'start'})` + clip screenshot по getBoundingClientRect. fullPage:true тоже работает.
- Навигация по `data-href` обрабатывается `components/screen-transition.js` (back-кнопка `.nav-bar__back data-href="lenta.html"` — это <button>, не <a>). Клик + `waitForURL` отрабатывает штатно, петель нет.
- Заголовок острова в lenta.html: `<a class="activity-header" href="okruzhenie.html">` с `.pulse-dot` и `.activity-header__chevron` (8×13, mask из ../assets/icons/chevron-right.svg).

## okruzhenie.html «Вокруг вас сейчас» (проверено 2026-06-16, PASS)
- 16 ячеек `.activity-list > .uni-cell-wrapper.__type-activity`. Последние 5 — редкие категории: `.__cat-win/.__cat-neuro/.__cat-memory/.__cat-holiday/.__cat-social`.
- Лид-визуалы (все присутствуют): status-dot×2, lead-sticker×6, ava-cluster×4, photo-pair×1, picture __size-44 ×3 + одиночные аватары.
- Разделитель: `.uni-cell-wrapper:not(:last-child)::after`, left=72px (= padding-left + 44 + 12), height 1px, цвет rgba(131,102,86,0.08). Корректно начинается после лид-визуала.
- КЛИП: стикеры/точки лежат внутри `.uni-cell-container` (overflow:hidden!), НО геометрически ни один не выходит за края контейнера (стикеры на 4-14px внутри низа). Проверять не классом, а сравнением getBoundingClientRect стикера vs контейнера-клиппера. Сейчас clipped:false у всех.

## promo-banner (первый блок okruzhenie.html, проверено 2026-06-16, PASS)
- `.promo-banner` (padding 12/16) > `.promo-banner__card` (h=64, border-radius 20px, overflow:hidden, bg #ffd6c4 = rgb(255,214,196)), width карты 358 (390 - 2×16).
- Декор: bow z-index:1 ПОВЕРХ car (z:auto). car height 96px, bow height 70px — оба ВЫШЕ карты 64px и геометрически выходят за низ (carExceedsBottom 16, bowExceedsBottom ~12.6) — это by design, клиппится overflow:hidden карты (визуально срез чистый по скруглению). НЕ путать с багом.
- Картинки локальные ../assets/around/banner-{bow,car}.png — грузятся: bow naturalW 1201, car naturalW 1100, complete:true.
- Гэп до первой ячейки 12px (next .uni-cell-wrapper top=188, cardBottom=176) — наезда нет, разделители ниже не съехали.
- Заголовок `.promo-banner__title` (fw 700, 2 строки) + inline `.promo-banner__arrow` «→».

## Computed animation-name (все применены)
- `.__cat-win .picture/.avatar ::after` → au-shine 3.2s
- `.__cat-win .lead-sticker` → au-medal-bob 2.4s (transform-матрица меняется по кадрам — живой bob)
- `.__cat-neuro .avatar/.picture` → au-neuro-ring 4s (визуально кольцо циклит magenta→blue, ловится кадрами ~1с)
- `.__cat-neuro .lead-sticker` → au-twinkle 1.8s
- `.__cat-memory .picture>img / .avatar>img` → au-memory 7s
- `.__cat-holiday .avatar/.picture` → au-holiday-glow 2.8s
- `.__cat-social .ava-cluster>.avatar:nth-child(2)` → au-gather 3s
- `.__cat-social .lead-sticker` → au-heart-pop 2.6s
- Чтобы поймать движение глазами: au-neuro-ring смена цвета кольца лучше всего видна на 2-3 кадрах с шагом 1с.

## Навигация (PASS)
- Клик `.activity-header` в lenta → okruzhenie.html, title «Вокруг вас сейчас — New Vision».
- Клик `.nav-bar__back` в okruzhenie → lenta.html, title «Лента — New Vision».
