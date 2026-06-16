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
