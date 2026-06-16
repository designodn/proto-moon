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
- ОТСТУПЫ строки __badge (проверено 2026-06-16, commit f019777): измерены по видимым краям
  (img.getBoundingClientRect + Range по текст-нодам, separator = div getBoundingClientRect).
  badge→"Еда"=4px, "Еда"→separator=2px, separator→"Рецепты"=8px. PASS, ровно 4/2/8.
  Separator computed margin = `0px 8px 0px 2px` (left 2 = gap от "Еда", right 8 = gap до "Рецепты").
  Видимая стрелка separator уже бокса: rect.w≈5px при заявленных 8px chevron (mask обрезает).
  Меряй по rect separator'а, не по w глифа.
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
