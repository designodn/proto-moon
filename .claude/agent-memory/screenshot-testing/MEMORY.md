# Screenshot-testing memory — proto-moon

## Окружение
- НЕТ доступа в интернет. Все внешние картинки (`i.pravatar.cc`, `picsum.photos`)
  падают с `ERR_CERT_AUTHORITY_INVALID`/network → `img.naturalWidth===0`.
  В скриншотах это серые/битые плейсхолдеры. Это ОЖИДАЕМО, не баг вёрстки.
  Проверять «грузятся ли картинки» по факту нельзя; проверяй лейаут плейсхолдеров.
- Сервер часто уже поднят на :8123 (Address already in use → это ок, просто curl 200).

## new-vision/lenta.html — person-link навигация (инлайн-скрипт внизу, ~стр.609)
- Скролл В `.phone-frame` (НЕ window). Но проще: в page.evaluate делать
  `el.scrollIntoView({block:'center'})` по найденному элементу, потом клик по его
  bounding-center через `page.mouse.click` — работает надёжно.
- Делегированный click на document. Сначала bail-гард:
  `e.target.closest('button,label,input,a,.actions-bar,.media__play,.media__mute')`
  → любой интерактив (вкл. label «Подписаться», лайк-кнопки) НЕ ведёт в профиль.
- Затем `closest('.nv-person-link')`; entity = data-entity (self/own → атрибут на самом el,
  иначе inner `[data-entity]`, иначе предок, иначе default 'user').
  - group → return (никуда). self → profile.html?view=self. иначе → profile.html (друг, без ?view).
- Маркируются (.nv-person-link): шапки постов `.uni-cell` с `.contents-view-container .ds-title-s`;
  `.uni-cell-wrapper.__type-activity` (виджет «Вокруг вас»); `.question-card .uni-cell`;
  авторы комментов; именинник.
- Селекторы для таргетинга по тексту:
  - имя в шапке: `.uni-cell .ds-title-s` (Елена Фёдорова / ОК Новости / Б15…) → `.closest('.uni-cell')`
  - активность: `.uni-cell-wrapper.__type-activity b` (Тамара Белова) → closest wrapper
  - вопрос: `.question-card .ds-body-m` (Ирина Кузнецова) → closest `.uni-cell`
  - self-пост: `.uni-cell .contents-view-container[data-entity=self]`
  - кнопка лайк/коммент = `.actions-bar label.button-wrapper.button-klass` (LABEL → bail)
- Факт 2026-06: ВСЕ 8 кейсов PASS. user→profile.html(без view), self→?view=self,
  group(ОК Новости / Б15 реклама)→без перехода, label Подписаться + лайк → без перехода.

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

## Шторка «Живой подарок» (bottom sheet) — profile.html, проверено 2026-06-16
- Контейнер `#bonsaiSheet.nv-sheet`; открыт = класс `__open` на нём.
  Панель `.nv-sheet__panel` (flex column): open → transform identity (matrix 1,0,0,1,0,0).
  Overlay `.nv-sheet__overlay` bg rgba(0,0,0,0.4), на нём же `[data-sheet-close]`.
- Открытие: тап по виджету `[data-bonsai-open]` (.nv-pr-bonsai, role=button).
  Делегированный click: bail на `[data-bonsai-water]` (кнопка «Полить» = no-op, шторку НЕ открывает);
  `[data-bonsai-open]` → openSheet; `[data-sheet-close]` ИЛИ класс `nv-sheet__overlay` → closeSheet.
  Esc тоже закрывает. Открывать удобно кликом по center bbox `.nv-pr-bonsai__title`
  (не по кнопке Полить, та внизу справа).
- ВАЖНО про индексы плиток: в каждой группе `.nv-gift-pick` ПЕРВАЯ плитка — `.nv-pick.__none` (⊘ «Без подарка»/«Без фона»).
  Значит «вторая выбранная» из ТЗ = picks[1] (🌳 Бонсай, __selected), «3-я» = picks[2] (🏡 Парник).
  Подарок: [⊘, 🌳 Бонсай(__selected), 🏡 Парник, 🚗 Машинка]. Фон: 4 плитки, ровно 1 __selected (🌸 Сакура).
- Radio-поведение: click внутри `.nv-gift-pick` снимает __selected/aria-pressed со всех, ставит на кликнутую → ровно одна __selected. Работает.
- Статус-блок: «Бонсай / 133 полива · 3 уровень» (в шторке именно 3, хотя ВИДЖЕТ сверху сейчас показывает «133 полива · 5 уровень» 💐 — т.е. виджет хардкоднут, расходится со self «0 поливов·1 ур·🌱» из старой памяти; данные виджета != данные шторки).
  Лента стадий `.nv-gift-stages__item` = 5 эмодзи [🌱🌿🌳🌸🌺], 3 __done + 2 __todo.
  Прогресс `.nv-progress__fill` style width:60% → computed ~214.8px, замеренный fill/track = 60%. Подпись «Осталось 14 поливов до 4 уровня».
- «Кто поливал» = 3 `.uni-cell` в `.nv-sheet__body`.
- Футер `.nv-sheet__footer`: position STATIC (не sticky CSS), но «липкий по лейауту» — панель flex column, body `.nv-sheet__body` overflow:auto (скроллится), футер последним ребёнком пинится у низа панели (y=760, bottom=844). Кнопка «Закрыть» 358px на всю строку → closeSheet.
- Все 6 сценариев PASS (открытие, контент, выбор 3-й плитки, закрытие кнопкой, закрытие по overlay-тапу сверху y=60, Полить=no-op).
- Ревью-правки (commit e794153, проверено 2026-06-16, все PASS):
  - НАВБАР `.nv-sheet__navbar`: justify-content flex-start; порядок детей [0]=`.button-inline-wrapper.__size-24.__view-secondary` (крестик close, data-sheet-close), [1]=`.nv-sheet__title`. closeLeft=16 < titleLeft=52, т.е. ✕ слева. Крестик закрывает шторку (click→нет __open).
  - «Кто поливал»: 3 uni-cell, имена теперь `.ds-title-s` (было ds-body-l), avatar `.__size-44`. CSS-патч `.nv-gift-watered .uni-cell{align-items:center;gap:var(--space-3)}` → computed align-items=center, gap=12px (DS uni-cell сам не задаёт).
  - Футер «Закрыть»: `button-container __style-secondary` (НЕ primary). bg=rgba(131,102,86,0.12) серо-беж, color чёрный (был primary).
