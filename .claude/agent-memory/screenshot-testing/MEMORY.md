# screenshot-testing memory — proto-moon

## Setup
- Serve from REPO ROOT: `python3 -m http.server 8080 --bind 127.0.0.1` (new-vision pages pull `../index.css`, `../assets/`).
- new-vision/lenta.html = vision feed. Congrats cards are the first 4 articles after the stories row.
- Viewport 390x844, isMobile, deviceScaleFactor 2.

## Scroll container
- On new-vision/lenta.html the SCROLLABLE element is `.phone-frame` (height 100dvh), NOT `.phone-frame__feed` (which is sized to full content height = not scrollable). Set `document.querySelector('.phone-frame').scrollTop = y` to scroll. `document.scrollingElement` is fixed at viewport height.

## Icons (.icon.__src / __slot-*)
- The glyph paints via `::before` pseudo-element (mask-image = var(--icon-src), background-color = currentColor). Computed style ON the element shows mask:none/bg:none — that's a false negative. Always check `getComputedStyle(el, '::before')`. White-on-gradient gift icon confirmed via ::before maskImage + bg rgb(255,255,255).

## Avatars
- `.avatar img { width:100%; height:100% }` and `.avatar` is box-sizing:border-box. If any parent rule injects padding onto the avatar, the content box shrinks and the img shrinks with it.
- Selector `.feed-congrats.__birthday .avatar img` matches MULTIPLE imgs (big 72px + stacked __size-36 friend avatars). Use `:scope > .avatar.__size-72 img` to target the hero avatar.

## Findings logged (2026-06-16, congrats cards)
- BUG: rule `.feed-congrats > :not(.media) { padding: 0 16px }` (nv-feed-congrats.css:20) also hits the direct-child `.avatar.__size-72` → 16px L/R padding on a border-box 72px avatar = 40px content box → hero photo clamped to 40px wide and offset. Removing padding restores 72x72.
- BUG: `assets/new-vision/birthday-nikolay.png` is a 2180-byte, fully-transparent placeholder (center + quadrants alpha=0). Renders as empty grey circle even at correct size. The other 3 illustrations (gift-jam 1.4MB, gift-bonsai 855KB, postcard-dog 472KB) are real and paint fine.
- Pravatar/picsum (`i.pravatar.cc`, `picsum.photos`) external avatars/photos fail in sandbox with ERR_CERT_AUTHORITY_INVALID — small friend-avatar circles show broken-image glyph. This is sandbox-network, not a code bug. Ignore for layout verdicts.
- Gradient buttons OK: `.nv-gift-btn` = linear-gradient(175deg,#8d41ff→#f987a2→#f79369), white text; `.__create` = orange linear-gradient(95deg,#ff9a3d→...). 358x44.
- Title font confirmed OK Sans: `"OK Sans Text","OK Sans Display",Onest,system-ui...` at 24px. Not serif.
- Inner gift card: border 2px solid rgba(131,102,86,.08), radius 20px. Media full-bleed via width calc(100% + 32px) + negative margin → media slightly WIDER than card (e.g. 386 vs 390 minus the 16px island gutter; renders edge-to-edge inside card, looks correct). mediaFullWidth check returns false because media extends past card content box by design (negative margin) — not a bug.

## nv-breadcrumbs (tag line) — 2026-06-16, reordered 23-feed lenta
- Component CSS: `new-vision/components/nv-breadcrumbs.css` (imported in new-vision.css). `.nv-breadcrumbs__label` = font-weight 700, 15px/20px, OK Sans. Confirmed 700 on all 14 instances.
- ARROW `›` is a `::after` pseudo on `.nv-breadcrumbs__tag:not(:last-child)` (content "›", fw700, 17px, secondary color rgba(46,47,51,.88)). Do NOT probe `::before` of the 2nd tag — that's empty (false negative). Verified arrow paints on every multi-tag crumb.
- No horizontal padding in the component itself (by design — container puts it). Container `.feed-* > *` adds 16px left → leftInset measured 16px (single, NOT double 32px). Good. Some crumbs report paddingLeft:0 + leftInset 16 (padding from parent island), others paddingLeft:16 — both land at 16px effective. No double-gutter found.
- Dzen crumb: optional `.nv-breadcrumbs__badge` img (16x16, ../assets/new-vision/dzen-badge.png, 200) before "Дзен". Renders.

## New feeds verified (all PASS, layout-wise)
- Dzen post: dzen-heart.png loads (natural 360x270 = 4:3), renders 390x293 in `.media.__aspect-4-3`. Real anatomical-heart art, not placeholder.
- Advice (`.feed-advice`): 3 `.nv-advice-card` beige cards, inner scroller overflowX:auto, scrollWidth 599 > clientW 390, scrollLeft 0→200 moves => horizontally scrollable confirmed. cardH 186.
- Moment (2nd `.feed-stories`): title + 5 `.avatar.__size-56 __ring-active/__ring-viewed __has-caption` story circles in `.feed-stories__list`. Rings + captions render; photos pravatar (cert-broken).
- Gift-create congrats: gift-jam.png loads 386x386 (`.media.__aspect-1-1`), orange gradient `.nv-gift-btn.__create` (linear-gradient 95deg #ff9a3d→). Received-gift: gift-bonsai.png loads 386x386, purple gradient nv-gift-btn (linear-gradient 175deg #8d41ff→).
- Birthday avatar 72px BUG IS FIXED (commit 72d17f2): hero `.feed-congrats.__birthday > .avatar.__size-72` measures 72x72 now, and source switched from the empty birthday-nikolay.png placeholder to pravatar img=68. No more clamped 40px circle.
- Group feed (`.feed-group`): community header + "X друзей подписаны" + Подписаться. Layout intact; cover & friend avatars pravatar/cert-broken.
- 3 nv-gift-btn all 358x44, white text, correct gradients.

## Gotchas
- PNG-asset emptiness is invisible to `img.complete/naturalWidth` (returns loaded:true for transparent PNG). Decode IDAT alpha to catch placeholder/empty assets.
- `.feed-advice` inner scroller = `.nv-advice-card`'s direct parent. To test h-scroll set that parent's scrollLeft, not the article's.
- Full lenta scrollHeight ~10907px at 390w. Scroll via `.phone-frame.scrollTop` still holds for this reordered version.
# Screenshot-testing memory — proto-moon

## Окружение
- НЕТ доступа в интернет. Все внешние картинки (`i.pravatar.cc`, `picsum.photos`)
  падают с `ERR_CERT_AUTHORITY_INVALID`/network → `img.naturalWidth===0`.
  В скриншотах это серые/битые плейсхолдеры. Это ОЖИДАЕМО, не баг вёрстки.
  Проверять «грузятся ли картинки» по факту нельзя; проверяй лейаут плейсхолдеров.
- Сервер часто уже поднят на :8123 (Address already in use → это ок, просто curl 200).

## new-vision/profile.html
- Скролл в `.phone-frame` (НЕ window). `document.querySelector('.phone-frame').scrollTop=N`.
  Контент компактный: при scrollTop=0 на 390x844 видно почти всё до Бонсая.
  scrollHeight ~1872, maxScroll ~1028.
- `?view=friend|stranger|self` → атрибут `document.body.getAttribute('data-view')`.
- Селекторы (стабильные):
  - имя: `.nv-pr-cover__name` ("Ольга Вайнер")
  - подпись: `.nv-pr-cover__sub` ("Родилась 2 сентября (26 лет)")
  - переключатель: `.nv-pr-switch [data-set-view]`, активный = класс `__active`
  - CTA: `[data-cta]` (в friend видим один — `data-cta="friend"` "У вас в друзьях",
    ширина ~358px тянется на всю строку; рядом 2 круглые кнопки звонок/ещё)
  - Бонсай: `.nv-pr-bonsai`, кнопка "Полить", арт 💐 = `.nv-pr-bonsai__art`
  - статы: `.nv-pr-stat__num` (244 друга / 1000 фото / 15 групп / 1 заметка / Ещё)
- ЛОВУШКА innerText: tab-бар и "Ещё 6" НЕ текстовые ноды.
  - таб-бар: `.phone-frame__tabbar .tabbar-icon` — иконки, подпись в `aria-label`
    ("Лента/Книга/Сообщения/Обсуждения/Клипы/Меню"). Активный = класс `__state-on`
    (в профиле горит `__slot-menu __state-on` = Меню, оранжевый).
  - "Ещё N": `.media__cell.__more[data-more="6"]` — плашка через CSS (`data-more`),
    не innerText. Рендерится "Ещё 6" поверх 4-й ячейки 2×2.
  - Поэтому regex по `document.body.innerText` на /Меню/ и /Ещё 6/ даёт false-negative.
    Проверяй наличие по селектору/атрибуту, а не по тексту.
- ЛОВУШКА поиска по тексту: `[...document.querySelectorAll('*')].find(/regex/)` ловит
  содержимое инлайновых `<style>`/`<script>` (комменты `// ── Состояния`, `html,body{`).
  Фильтруй по конкретному классу, не сканируй всё дерево.
- Статус-бар: цвет текста на оранжевом = `rgb(255,255,255)` белый, читаемо. 9:41 + иконки.
- Аватар: ~144x144, по центру (битый из-за сети, но размер/позиция ок).

## self-вью (?view=self) — проверено 2026-06
- Обложка `.nv-pr-cover` bg = rgb(255,255,255) белый (НЕ оранжевый), bg-image none.
- Имя/подпись `.nv-pr-cover__name`/`__sub` color = rgb(0,0,0) чёрный.
- Статус-бар: время `.status-bar__time` "9:41" color=rgb(0,0,0) чёрный
  (в friend было белое на оранжевом). Общего `.statusbar` нет — ищи `.status-bar__time`.
- CTA: видим только `[data-cta=self]` (display:flex). friend/stranger = hidden+display:none.
  - Обёртка `[data-cta]` прозрачна (rgba(0,0,0,0)); цвет смотри на ВНУТРЕННЕЙ кнопке.
  - self "Уведомления": btn bg = rgba(131,102,86,0.12) серо-беж, текст чёрный.
    + 2 круглые (settings, ещё) → 3 кнопки в блоке self-CTA.
- nav-actions: видим `[data-nav=self]` (display:flex), внутри 2 круглые кнопки.
- Бонсай self: "Бонсай 0 поливов · 1 уровень Полить 🌱", `.nv-pr-bonsai__art` = 🌱 (friend = 💐).
- Switch активный self = класс `__active`. Статы те же что friend.

## Вердикт-факт (2026-06): лейаут friend-вью корректен, всё на местах,
## единственная «поломка» — внешние картинки не грузятся (сетевое ограничение).

## preview.html — Breadcrumbs (2026-06)
- Якорь: `section.preview-section` где `h2` содержит "Breadcrumbs". На странице
  МНОГО `.breadcrumbs__item` (есть и в карточках ленты ниже) — бери секцию по h2,
  не первый item в DOM.
- `.breadcrumbs__item`: font-weight 600, 15px/20px — жирный, как заявлено. OK.
- `.breadcrumbs__badge` (`<icon-glyph class="breadcrumbs__badge __size-16">`):
  bounding 16x16, gap до текста 4px (gap на родителе-ссылке, align-items center). OK по лейауту.
- ГРАБЛИ / БАГ: иконка-звёздочка badge НЕ рисуется. icon-glyph красит
  `background-color: currentColor` под CSS-mask из `--icon-glyph-src`. Свойство задано
  ИНЛАЙНОМ `url('assets/icons/ok_star_16_20.svg')`, но `mask: var(--icon-glyph-src)`
  объявлен в `/components/icon-glyph.css` → Chromium резолвит относительный url
  ОТНОСИТЕЛЬНО стайлшита (`/components/`), а не документа. Итог mask-url =
  `/components/assets/icons/ok_star_16_20.svg` → 404 → mask пустой → бокс 16px есть,
  но прозрачный. Проверять так: `getComputedStyle(badge).maskImage` (резолвнутый
  абсолютный url) + curl этого url. Правильный путь `/assets/icons/...` отдаёт 200.
  Separator-chevron при этом виден (его src объявлен ВНУТРИ стайлшита breadcrumbs, не инлайном).
- Gap badge→текст: Range по текстовой ноде ссылки, `range.rect.left - badge.right`.
- ДСФ-ловушка: секция глубоко (y badge ~4696). При deviceScaleFactor 3 abs-clip за
  пределами скриншота → "Clipped area empty". Скриншоть через locator.screenshot()/scrollIntoView.
- ИСПРАВЛЕНО (commit 1d8c602, проверено 2026-06-16): badge переписан с `<icon-glyph mask>`
  на обычный `<img class="breadcrumbs__badge" src="assets/icons/ok_star_16_20.svg">`.
  Теперь резолв относительно ДОКУМЕНТА → currentSrc=`/assets/icons/ok_star_16_20.svg`,
  HTTP 200, naturalW/H=16, imgW/H=16, display:block, gap до текста=4px. Звезда видна.
  Текст всё ещё font-weight 600 / 15px/20px. PASS. Проверять img так:
  `img.currentSrc` + `img.naturalWidth>0` (mask-ловушка больше неактуальна для этого примера).
- Для проверки 404-битых img использовать requestfailed listener + img.naturalWidth===0;
  здесь оба чисты, requestfailed по star/icon пуст.
## Merge-verify lenta (2026-06-16, commit e937eb8 «Merge origin/main…»)
- Авто-слияние ЧИСТОЕ. Конфликт-маркеров нет (grep -c =0; regex по innerText = none).
- Точный счёт в `.feed-container`: ровно 23 `<article>` в порядке 1→23, без дублей.
  cardOrder: base, ad, congrats __birthday(#3), base×4, ad, base(дзен #9),
  questions(#10), base(клип #11), group(#12), ad, base(#14), congrats __gift(#15),
  discussion(#16), stories(#17 момент), contest(#18), ad, base, memory(#21), base, congrats __gift(#23).
- Шапка: meshokUp=1, «Вокруг вас сейчас» activity=1 (из main), feed-stories=2
  (карусель «Сейчас на даче» + момент #17). congrats=3 (birthday/gift/gift). questions=1 с 3 карточками.
- nv-breadcrumbs=14, zeroHeightMedia=[], font=OK Sans. scrollH ВЫРОС до 11124 (было ~10907) — из-за activity-виджета сверху.
- question-card #10 bg = rgba(131,102,86,0.12) серо-беж, 196x220. Дзен-арт, бонсай-арт (#23 gift-bonsai) и birthday-illustration рендерятся локально и грузятся.
- ЛОВУШКА скриншота: на ленте висит ФИКС оранжевый промо-баннер «Народный день подарков!»
  поверх таб-бара снизу — это часть дизайна, НЕ артефакт слияния. Перекрывает низ карточек на скринах, не пугаться.
- menu.html / profile.html (из main): открываются 200, markers=none, 0 JS-ошибок, textLen 146/274 — не пустые, не сломаны.

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

## АНИМАЦИИ ПОЯВЛЕНИЯ ячеек (новый код, проверено 2026-06-16, PASS) — заменил старые лупы лид-визуалов
- Файлы: `new-vision/around-you.css` (keyframes au-enter/au-fade/au-neuro-text/au-confetti) + inline-скрипт в конце okruzhenie.html (ставит `--enter-delay`=i*0.06s на каждый `.uni-cell-wrapper`, добавляет `.play` на `#activityList`, перезапуск по `#replayBtn`).
- ВАЖНО: класс на список — это `.activity-list.play` (id=activityList). `#replayBtn` — ПЕРВЫЙ child списка, но `.uni-cell-wrapper` его не цепляет, индексы стаггера корректные.
- replay-кнопка делает `remove('play'); offsetWidth; add('play')` СИНХРОННО → если проверять classList до/после click, оба раза true (класс не «слетает» наблюдаемо). Чтобы доказать перезапуск — трейсить computed (color/opacity) через rAF после клика, не classList.
- Замеры (settled): `.uni-cell-container::before` animName=au-fade у ВСЕХ. bg: обычная rgba(255,138,76,.18); win rgba(255,196,61,.30); holiday rgba(150,120,255,.20); neuro = linear-gradient(90deg, #ff7a18, #ff4d8d 50%, #9b5cff) (bgColor прозрачный, gradient в background — НЕ none). z-index ::before = -1, container isolation:isolate → подложка ЗА текстом, текст читается (overlap нет).
- neuro-текст: `.uni-cell-additional-content` animName=au-neuro-text. Стартует белым (255,255,255) и держит до ~45% от 1.3s, затем градиент в чёрный; settled color=rgb(0,0,0). Кроссовер белый→серый→чёрный наблюдается ~delay+0.7..1.3s (neuroIdx=13 → delay 0.78s → переход ~1.5–2.1s от replay).
- Конфетти: holiday-ячейка, 8×`.confetti > i`, animName=au-confetti 1s. `.confetti` лежит в `.uni-cell-wrapper`, НЕ внутри `.uni-cell-container` (тот overflow:hidden) → confInsideContainer=false, частицы свободно летят за края ряда. Ловится визуально на ~delay+150ms.
- ТАЙМИНГИ ловли: подложки fade 1.3s от своего --enter-delay. Чтобы поймать нижние спец-ячейки (neuroIdx13 delay .78s, holidayIdx15 delay .90s) — scrollIntoView, replay, ждать ~950–1050ms, снимать. Ранний общий кадр (верх списка) — снимать на 200ms сразу после goto(waitUntil:commit).
- Регрессия чистая: cells 17 (16 + промо-баннер как wrapper? нет — 17 wrappers вкл. промо? фактич. querySelectorAll('.uni-cell-wrapper')=17, buttons 17, ava-cluster 4, photo-pair 1, lead-sticker 6). Разделители/кнопки/лид-визуалы на месте, settled = чистые белые ячейки.

## Computed animation-name (УСТАРЕЛО — лупы лид-визуалов au-shine/au-neuro-ring/au-medal-bob и т.д. УДАЛЕНЫ, заменены анимацией появления выше)
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

## Гэпы между островами в ленте (commit 0dc79c0, проверено 2026-06-16, PASS)
- ЛОВУШКА: `.meshok-up` имеет `display:contents` → её собственный getBoundingClientRect = 0×0 (top0/bottom0). НЕ мерить gap к виджету по rect самого .meshok-up — он соберёт мусор (получал «160»). Мерить по max bottom её детей: status-bar(0-44) + nav-bar.__type-feed(44-100) + tabs(100-160) → эффективный bottom=160.
- Виджет «Вокруг вас сейчас» (.phone-frame__feed .island[0]) стартует ровно на y=160 → пара 1 (мешок↔виджет) = 0px, СЛИТНО (by design).
- Фикс перенёс открытие `.feed-container` ПЕРЕД `article.feed-stories.island` (дача), контейнер получил `margin-top: var(--space-1)` = 4px. storiesInsideContainer=true, contestInsideContainer=true.
- Замеры пар (390×844): gap2 виджет↔дача(feed-stories) = 4px (382-378); gap3 дача↔урожай(feed-contest) = 4px (552-548, БЫЛ 0 — баг пофикшен); gap4 урожай↔след(feed-memory) = 4px (930-926). Все три гэпа = --space-1, равномерно.
- border-radius=0 у всех (meshok-детей нет, но widget/stories/contest/next = 0px) — `.__flush-islands` по-прежнему держит.

## .__flush-islands (commit f2cfa39, проверено 2026-06-16, PASS)
- Модификатор на `.phone-frame__feed` (lenta.html). Правило `components/island.css`: `.__flush-islands .island, .island.__flush { border-radius: 0 }` (spec 0,2,0) перебивает базовый `.island{border-radius:20px}` (line 27, spec 0,1,0). Работает.
- В ленте 18 `.island`: [0] активити-виджет, [1] feed-stories, [2] feed-contest, [3] feed-memory, [4] feed-discussion, [5] feed-questions, [6-8/12-16] feed-base, [9] feed-group, [10] feed-birthday, [11] feed-ad, [17] финальный CTA. У ВСЕХ computed border-radius=0px (было 20px).
- Чтобы перечислить острова с лейблами: querySelectorAll('.phone-frame__feed .island'), label = текст .activity-header .ds-title-l / .island__header или класс feed-*.
- Шеврон/навигация ещё раз подтверждены на этом коммите (см. блок ниже).

## Навигация (PASS)
- Клик `.activity-header` в lenta → okruzhenie.html, title «Вокруг вас сейчас — New Vision».
- Клик `.nav-bar__back` в okruzhenie → lenta.html, title «Лента — New Vision».

## Жалоба «шеврон не виден + тап не ведёт» — НЕ ВОСПРОИЗВЕЛАСЬ (проверено 2026-06-16)
- lenta.html грузит ТОЛЬКО `new-vision.css`; around-you.css приходит через @import url('./around-you.css') (new-vision.css:31, все @import подряд в начале до правил — валидны). RESP 200 на around-you.css подтверждён в network. `.activity-header` computed display:flex → стили применились.
- Шеврон РЕНДЕРИТСЯ и виден: `.activity-header__chevron` 8×13, rect x≈227 y≈183 (ненулевой), bg rgba(46,47,51,0.88) (= резолв --dynamic-text-and-icons-base-secondary), maskImage=url(.../assets/icons/chevron-right.svg) (НЕ none), maskSize contain. Зум-скрин: › чётко справа от оранжевой пульс-точки.
- chevron-right.svg существует (assets/icons/, 215 b, path stroke=currentColor) → fetch('../assets/icons/chevron-right.svg') со страницы = 200.
- Навигация работает: click .activity-header → okruzhenie.html; click по тексту .ds-title-l внутри → тоже okruzhenie.html. Это честный <a href="okruzhenie.html"> (нет JS-перехвата на этом элементе; screen-transition.js работает по data-href, а тут обычный href).
- elementFromPoint(центр текста)=SPAN.ds-title-l (closest a = A.activity-header); elementFromPoint(центр шеврона)=SPAN.activity-header__chevron (closest a = A.activity-header). Оверлея поверх НЕТ.
- Единственные console-errors = ERR_CERT_AUTHORITY_INVALID на внешних i.pravatar.cc/picsum (норма в песочнице, к багу не относится).
- ВЫВОД: на текущем HEAD оба заявленных бага отсутствуют. Если юзер видит иное — вероятный кэш старой версии CSS/страницы, либо смотрит не на этом коммите. Гипотеза для автора: проверить hard-reload/версию.
