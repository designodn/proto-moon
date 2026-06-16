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

## inline-ticket в ячейке okruzhenie — ИТОГ: PASS (commit «inline-span nowrap», проверено 2026-06-16)
- ФИКС, который сработал: связку обернули в `<span style="white-space:nowrap">2 <span class="inline-ticket"></span> билета</span>` внутри внешнего span. Трио теперь на ОДНОЙ строке.
- Замеры (390×844, дефолт): «2» top=218 left=72..80; ticket top=220.09 left=84..100 (16×16, центр по 20px line-height → top на ~2px ниже глифов = норма); «билета» top=218 left=104..112. two.top==bil.top (218) → одна строка. iconBetween=true. Текст = 3 визуальные строки (contentHeight 60 / lh 20).
- Адверсариально: форс maxWidth:120px на .uni-cell-additional-content — трио ВСЁ РАВНО одна строка (two.top=bil.top=238, iconBetween=true). nowrap реально держит, не случайность.
- status-dot зелёный виден, кнопка «Смотреть» на месте.
- Точные глифы мерить через Range.setStart/setEnd (TreeWalker SHOW_TEXT) + getBoundingClientRect; иконку — getBoundingClientRect самого .inline-ticket.

## inline-ticket — история провалов (для контекста, FAIL ×2)
- ЛОВУШКА: `.uni-cell-additional-content` = `display:flex; flex-direction:column` (components/uni-cell.css:143). Любой inline-элемент НАПРЯМУЮ внутри (span .inline-ticket) становится FLEX-ITEM → blockified: computed display=block, хотя в CSS `.inline-ticket{display:inline-block}`. Иконка падает на ОТДЕЛЬНУЮ строку.
- ПОПЫТКА ФИКСА (commit 5c145d5): обернули всю фразу в один `<span>` внутри acc. Теперь span = flex-item display:block (ок), а .inline-ticket снова честно inline-block (ок, computed=inline-block, 16×16). НО ФРАЗА ВСЁ РАВНО РВЁТСЯ: естественный перенос строки падает ровно между «2» и иконкой → «выиграла 2» в конце строки 1, иконка+«билета» в начале строки 2. Замеры: last-char «2» top=198 left=265 (конец стр.1); ticket top=220 left=72 (начало стр.2); «билета» top=218. Текст ~3 визуальных строки. wrap-обёртки самой по себе НЕДОСТАТОЧНО.
- ПРАВИЛЬНЫЙ ФИКС: обернуть только связку «2 [ticket] билета» в inline-span с `white-space:nowrap`, чтобы число+иконка+слово не разрывались. Display:block у внешнего span проблему переноса не решает.
- Сам по себе .inline-ticket корректен: webkitMaskImage=url(ticket_24.svg) (НЕ none), maskSize contain, box 14×14, bg rgb(255,119,0)=#FF7700 (var --static-surface-status-accent), transform rotate~8deg (matrix 0.99/0.139). Видна крупным планом — оранжевый билет.
- Онлайн status-dot: rgb(47,182,117) зелёный, 12×12, addon absolute __pos-bl, bottom-left 44px аватара, dotInsideContainer:true (не обрезан overflow:hidden).
- Ячейка стоит первым .uni-cell-wrapper сразу после .promo-banner (placement верный).
- accentVar резолвится в #FF7700 (не #EE8208 fallback из tooltip.css).

## Навигация (PASS)
- Клик `.activity-header` в lenta → okruzhenie.html, title «Вокруг вас сейчас — New Vision».
- Клик `.nav-bar__back` в okruzhenie → lenta.html, title «Лента — New Vision».
