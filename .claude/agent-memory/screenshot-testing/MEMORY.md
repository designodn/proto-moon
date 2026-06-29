# MEMORY — screenshot-testing

Накопленные находки прогонов (тайминги, хрупкие селекторы, ловушки навигации,
unlock-паттерны). Пиши коротко, фактами. Держи компактно: при > 200 строк / 25 KB
режь старое или сворачивай в обобщения — в контекст войдёт только начало файла.

---

## 🔎 Кандидаты в статический чек-лист (для `macket-rules-checker`)

> Сюда выноси находки, которые можно поймать **статикой по диффу** (без браузера).
> Это «шина»: ты сюда дописываешь, а раз в неделю её разбирает
> **`macket-insights-curator`** — переносит устойчивых кандидатов в чек-лист
> ревью-агента (`.claude/agents/macket-rules-checker.md`). Сам ревью-агент эту шину
> НЕ читает.
>
> Формат строки:
> **`правило → признак (grep/селектор) → severity(WARN|FAIL) → hits:N (файлы: a.html, b.html)`**
> - Пиши, только если баг РЕАЛЬНО ловится из исходника (класс/атрибут/путь/порядок
>   тегов), а не только в рантайме.
> - Новый кандидат входит как **WARN, hits:1** + файл, где встретил.
> - Видишь тот же баг снова на ДРУГОМ диффе → **не дублируй строку**, а `hits++` и
>   допиши новый файл (если он новый). Тот же файл/коммит повторно — не считается.
> - severity → `FAIL`, когда признак однозначный (без ложных срабатываний).
> - После переноса в постоянный чек-лист — помечай строку `[ported]`.
>
> Порог переноса (его применяет `macket-rules-checker`): **hits ≥ 3 И ≥ 2 разных
> файла И признак точный.**

- twitter-карта НЕ должна иметь одновременно крошки и activity-строку → признак: `article.caf.__twitter-like` содержит И `.breadcrumbs/.caf__crumbs` И `> .text-feed__activity` → FAIL → hits:1 (файлы: activity-lenta/lenta.html). «Шапка важнее крошек»: ровно одно из двух. Ловится grep'ом/селектором по диффу.
- CSS-маска с относительным `url()` в external stylesheet → признак: `mask`/`-webkit-mask`/`background`/`mask-image` со значением `url(assets/...)` (относительный путь БЕЗ ведущего `/` или `../`) внутри файла в `components/*.css`, либо через inline `--var: url(assets/...)`, который потребляется `mask:` в `components/*.css` → severity WARN → hits:1 (файлы: components/today-widgets.css). Причина: относительный url в CSS резолвится от расположения СТИЛЯ (`/components/`), а не от HTML → реальный путь `components/assets/...` = 404, маска пустая, иконка невидима. Фикс: `url(../assets/...)` или абсолютный `/assets/...`.

---

## Прогоны: тайминги · селекторы · ловушки

### Node-сервер `server.mjs` (НЕ статика python)
- Прототип может обслуживаться Node-сервером `server.mjs` (порт из `PORT`, синк
  выключается `SYNC_ON_START=false`). Сервер ПОДМЕШИВАЕТ во все `text/html` скрипт
  перед `</body>` (`HOME_GESTURE`) — поэтому исходник файла ≠ то, что отдаёт сервер.
  Если на :3000 уже висит старый инстанс — он отдаёт СТАРЫЙ инжект. Перед прогоном
  проверь, чей код: `ps aux | grep "node server.mjs"`, при нужде `kill <pid>` и
  подними свой. Признак старого инжекта: в HTML есть `#__launcher-home`.
- Скрытый жест возврата на разводящую «/»: ТРИ клика подряд (<800мс) по
  `[aria-label="Поиск"]` → `window.location.href='/'`. Абсолютный путь, поэтому из
  подпапки (`activity-lenta/`, `<base href="../">`) тоже ведёт на КОРЕНЬ, а не
  относительно base. Подтверждено в браузере.
- Тайминг счётчика: окно сброса 800мс (`setTimeout`). 2 тапа не навигируют; 3-й тап
  после >800мс — счётчик сброшен, не навигирует. Только 3 быстрых подряд.

### Гейт онбординга на лентах (ловушка!)
- `lenta-q3.html` тоже редиректит на `add-friends-sheet.html` через
  `location.replace`, гейт по `sessionStorage` ключу **`afs-seen`** (НЕ `afs-seen-al`,
  тот — для `activity-lenta/lenta.html`). На РЕЛОАД ключ удаляется (`isReload` через
  performance navigation type) → шторка снова. Чтобы тестировать саму ленту: до
  загрузки `page.addInitScript(()=>sessionStorage.setItem('afs-seen','1'))`. На первом
  `goto` (type=navigate, не reload) этого достаточно — гейт пропускает.
- Симптом «не словил гейт»: в live DOM один-единственный `[aria-label]` = "Закрыть",
  url = `…/add-friends-sheet.html`. Куча `ERR_ABORTED` на `components/*.js` — это
  просто прерванные запросы из-за `location.replace`, не сетевая поломка.

### activity-lenta/lenta.html — таб «Подборки» + чипсы подборок
- Гейт `afs-seen-al`: до загрузки `addInitScript(()=>sessionStorage.setItem('afs-seen-al','1'))`
  → первый `goto` не редиректит на `add-friends-sheet.html`. На reload тоже держится
  (init-script переустанавливает). Подтверждено.
- Таб «Подборки»: `button.tabs-tab[data-tab="podborki"]`, панель
  `[data-tab-panel="podborki"]` рендерится с атрибутом `hidden`. Клик по табу
  (`.click({force:true})`) снимает `hidden` (стало `false`) — таб реально
  переключается, без навигации. URL не меняется.
- Чипсы подборок: `.collection-chips .chips-view__row .chip-container`. Дефолтный
  невыбранный `__view-primary` bg = `rgba(131,102,86,0.12)`, color `rgb(0,0,0)`,
  imgFilter `none`. Кастомный выбранный чип делается через
  `__view-custom __selected-custom` + inline `--chip-background-selected-color`/
  `--chip-selected-color` (НЕ отдельным классом-модификатором цвета).
- Подтверждено: «Еда» выбран — bg `rgb(201,54,0)` (=#C93600), color `rgb(255,255,255)`,
  иконка инвертирована в белый (`filter: brightness(0) invert(1)`). «Люди» —
  обычный невыбранный `__view-primary`. Устойчиво к reload.

### activity-lenta/lenta.html — таб «Друзья» + рекламные посты (type ad)
- ⚠️ Селектор-ловушка: `.tabs-tab[data-tab="druzya"]` резолвится в **6 элементов**
  (sticky таб-бар продублирован у каждой карты-агрегатора). Strict mode падает →
  бери `.first()`. Дефолтный активный таб при загрузке = `lenta` (НЕ `druzya`):
  чтобы попасть в «Друзья», нужен клик `.first().click({force:true})` → активный
  становится `druzya` (проверял по `.tabs-tab.__state-on`).
- Реклама свёрстана **статикой в HTML** (НЕ JS-рендер из `data/activity-feed.json`,
  хотя там 5 ad-объектов с `tab:"Друзья"` — данные есть, но страница хардкодит
  разметку). Признак ad-карты: `article.caf.__twitter-like` с `.caf__date` = «· Реклама 0+»
  (вместо времени) + полноширинная CTA `.button-wrapper.__full-width > .button-container.__style-primary`
  «Перейти», БЕЗ `.caf__actions` (3 счётчика comment/reshare/класс).
- Замеры (390×844): 5 ad-карт в «Друзья» — Б15, Магазин снастей (×2), Магазин цветов
  Фантазия, Магазин цветов. Все: avatar 44×44, content/img/btn выровнены left=72,
  right=374, btnW==contentW==302 (кнопка ровно по контентной колонке), img ratio 1.35,
  full-width. Кнопка `__style-primary` bg = `rgb(246,74,0)` (оранжевая, дефолт DS —
  НЕ «синяя», как иногда формулируют в заявке; это норма). Устойчиво к reload (статика).
- Несвязанная мелочь: у НЕ-ad поста «Виктор Бондарев» битые `<img>` плейсхолдеры
  медиа — отсутствующий ассет на обычной карте, не на рекламной.

### today.html — портлет «День рождения» (`.tg-card--bday`)
- `today.html` НЕ редиректит на онбординг, рендерится сразу (в отличие от
  `lenta-q3.html`/`activity-lenta`). Карточка bday — самый первый блок ленты сверху.
- При viewport 390×844: карточка 374×220px, padding 16 со всех сторон. Лейаут
  (отступы относительно карты): title top16/left16 (лево-верх, max-width 65%),
  ava top16/right16 (право-верх), cta «Поздравить!» 116×36 left16/bottom16
  (низ, своя ширина). Auto-зазор title↔cta ≈ 80px (`.tg-bday__cta margin-top:auto`,
  `.tg-bday__body` flex-column height:100%). Лейаут устойчив к reload.
- v2 (коммит после 8528746): ава стала `__size-72` (было 56) + DS-модификатор
  `__border`. Замер: 72×72, top16/rightGap16. Тайтл `ds-title-m` (font-size 17px).
  `__border` даёт `box-shadow: rgb(255,255,255) 0 0 0 3px` (НЕ none) — белая обводка
  3px. Несмотря на `overflow:hidden` карты, ринг не клипается: правый край авы =
  card.right−16, ринг +3px → до card.right−13, с запасом внутри. Устойчиво к reload
  (размер/boxShadow/классы совпали до и после).

### today.html — виджет «Луна» (`.tg-card--moon`): невидимые белые глифы
- Карточки погода/луна/гороскоп в `section.tg-island:has(.tg-cards)`. Луна = две
  строки `.tg-card__moon-row`: слева сквиркл `.tg-card__moon-ic` 44×44 (`.__indigo`
  bg rgb(139,141,212) / `.__jungle` bg rgb(100,164,149)), внутри `.tg-card__moon-glyph`
  24×24 — это CSS-МАСКА (`mask: var(--glyph) ... ; background-color: currentColor`,
  color наследуется белым). `--glyph` задаётся inline: `--glyph: url(assets/icons/cut_24.svg)`.
- БАГ (наблюдён, ПОЧИНЕН): сквирклы видны, белой иконки внутри НЕТ. Причина —
  относительный url маски резолвится от стиля `components/today-widgets.css`, поэтому
  computed `maskImage = .../components/assets/icons/cut_24.svg` → HTTP 404 (root
  `assets/icons/cut_24.svg` = 200, но к нему путь не ведёт). Пустая маска = прозрачно.
  Подтверждено: `new Image().src=maskURL` → onerror 404 изнутри страницы.
- ФИКС (подтверждён hard-reload): inline `--glyph` заменён на классы в
  `today-widgets.css`: `.tg-card__moon-glyph.__cut{--glyph:url(../assets/icons/cut_24.svg)}`
  / `.__flower{url(../assets/icons/flower_24.svg)}`, HTML-спаны `__cut`/`__flower`.
  Теперь computed maskImage = `/assets/icons/cut_24.svg` (и flower), Image LOADED w=24,
  HTTP 200, белые ножницы/цветок видны. `../` относительно стиля в `/components/`
  корректно даёт корень репо.
- horo-карточка (`.tg-card--horo` «Козерог»): иллюстрации СЛЕВА от текста НЕТ по
  дизайну. Есть только фон `assets/today/horo-back.png` (naturalW 688, complete,
  object-fit cover, position absolute z-index 0, 374×220, перекрыт текстом сверху —
  это фон, не «иллюстрация слева»). Т.е. «лунный гороскоп виджет с невидимой
  иллюстрацией слева» = именно карточка ЛУНА, баг = 404 маски глифа.

### today.html — скрытие портлета ДР при входе из Q3 (`?from=q3`)
- В `<head>` `today.html` синхронный скрипт: `?from=q3` → класс `today-from-q3` на
  `<html>`. CSS `.today-from-q3 .tg-island:has(> .tg-card--bday){display:none}`.
- Замер `today.html?from=q3`: html-класс содержит `today-from-q3`, остров bday
  `display:none, height 0`, `bdayHeight=0`, `offsetParent=null`. Первый видимый блок —
  `.tg-news` («Сейчас в СМИ»), его island top=64 (сразу под навбаром, фантомного
  зазора НЕТ). Без параметра: класса нет, bday h=220, offsetParent!=null, ава
  `__size-72 __border`, news top=296.
- Навигация из Q3: у `.calendar-date` в навбаре `lenta-q3.html` атрибут
  `data-calendar-href="today.html?from=q3"`; `calendar-date.js` по тапу делает
  `location.href`. Кнопка = `button[aria-label="Календарь событий"]`, клик ведёт ровно
  на `today.html?from=q3`, портлет там скрыт.
- ЛОВУШКА тайминга после клика-навигации: `waitForURL('**/today.html?from=q3')`
  резолвится по URL, но DOM новой страницы ещё НЕ отрендерен (screen-transition) →
  measure возвращает `NO-ISLAND/NO-BDAY/hasFromQ3:false`. Дожидайся контента:
  `waitForFunction(()=>document.querySelector('.tg-feed')||'.tg-news')` + ~700ms, тогда
  замеры корректны.

### Activity-лента: таб «Сегодня» прячет портлет ДР (контекстное скрытие)
- Правило в `today-widgets.css`:
  `.ll-tabpanel[data-tab-panel="segodnya"] .tg-island:has(> .tg-card--bday){display:none}`.
  Работает: остров с bday → `display:none, height 0, top 0` (полностью схлопнут,
  фантомного зазора НЕТ). Первый видимый виджет панели — остров «Сейчас в СМИ»
  (`.tg-news`). На standalone `today.html` правило НЕ применяется (нет
  `.ll-tabpanel[...="segodnya"]`-обёртки) → bday виден, h=220, ава `__size-72 __border`.
- ЛОВУШКА с селекторами на `activity-lenta/lenta.html`: таб `.tabs-tab[data-tab="segodnya"]`
  присутствует в **6 экземплярах** (несколько таб-стрипов, в т.ч. дубль/sticky) →
  `locator.click()` падает strict-mode violation. Кликай ВИДИМЫЙ через evaluate:
  перебери все, возьми первый с `offsetParent!==null && height>0`.
- Панель `.ll-tabpanel[data-tab-panel="segodnya"]` — в 1 экземпляре (panelCount=1),
  но всё равно бери видимую через `getComputedStyle(p).display!=='none'`.
- Гейт онбординга activity-lenta: `sessionStorage['afs-seen-al']='1'` через addInitScript
  ДО goto — пропускает на первом заходе. (Подстраховался и `afs-seen` тоже выставил.)

### Activity-лента: привязка постов к табам по колонке «Таб» (правка, uncommitted на 2026-06)
- Структура: каждый таб = отдельный `.ll-tabpanel[data-tab-panel="<slot>"]`, у всех,
  кроме активного, `hidden`. Внутри каждой панели СВОЙ продублированный таб-стрип
  `.tabs.ll-feed-tabs` с `.tabs-tab[data-tab]` (поэтому `[data-tab="X"]` встречается
  в 6 экземплярах — кликай только видимый, через evaluate по offsetParent!==null).
- Переключение «на месте»: клик по табу делает видимой ровно ОДНУ панель
  (visibleCount==1 в каждом табе подтверждено). Контент чисто статический HTML →
  переживает любую навигацию; reload роли не играет (но reload всё равно роняет на
  add-friends-sheet из-за гейта — это by design, см. ниже).
- Замеренное наполнение (viewport 390×844, после addInitScript afs-seen-al=1):
  lenta=6×caf (все с крошками, 0 activity); podarki=3×caf (gift/ai-gift);
  druzya=12 article (11×caf + 1×`article.feed-birthday island` = «friendversary»,
  «поздравляем с годовщиной дружбы», полноширинная); lokalnoe=РОВНО 1×`article.text-feed
  island ll-clipc` (клип, подпись «Может быть интересно»); podborki/segodnya=1 island.
- «Шапка важнее крошек» соблюдено: НИ одной caf-карты с одновременными `.caf__crumbs`
  И `> .text-feed__activity` (offenders=[] во всех табах). В druzya у части постов
  серая activity-строка, у части крошки — взаимоисключающе.
- Визуально не разъехалось: таб-стрип «врос» в первый остров панели, активный таб
  жирный, карточки/отступы ок. Подтверждено скринами всех 6 табов.

### Activity-лента, таб «Подарки»: CTA-кнопки под карточками подарков (2026-06)
- Карты подарков на табе podarki: `.text-feed__reshare-card.__gift` (обычный) и
  `.__ai-gift` (ИИ). Под медиа-блоком карты добавлена CTA, обёрнута в `.actions-bar`
  (СИБЛИНГ карты, не вложен в неё — ищи через `card.nextElementSibling`-обход).
  Внутри `.button-container`:
  - обычный gift → `.button-container.__style-primary`, текст «Сделать подарок»,
    bg=none (сплошной оранж primary).
  - ai-gift → `.button-container.__style-ai-gift`, текст «Создать подарок из фото»,
    bg `linear-gradient(90deg, #ff7700→#ff9c40…)`, иконка `<img src="assets/icons/
    sparkles_16_20.svg">` (НЕ DS-icon span — обычный img, красится filter brightness(0)
    invert(1) для белого).
- Порядок DOM в контентной колонке: карта подарка → `.actions-bar`(CTA) →
  `.caf__actions`(счётчики комм·репост·класс). Подтверждено координатами:
  cardTop<ctaTop<actionsTop.
- Ширина CTA = ширина контентной колонки (302px при vp 390, колонка справа от авы
  44px, left=72). Не обрезана, h=36. Переживает reload (статический HTML, MATCH=true
  по cls/width/text до и после reload+пере-клик таба).
- bday-карта DR (`.tg-card--bday`) в этой правке поменяла лейаут: ава `__size-72
  __border` ушла в `.tg-bday__top` рядом с тайтлом (а не под ним) — это в табе
  «Сегодня», который контекстно скрывает портлет (см. выше), но в standalone лейаут
  новый.

### lenta.html (корневой) — сториз-ряд `#ll-stories-row`
- Аватарки сториз грузятся с ВНЕШНИХ хостов `i.pravatar.cc` и `i.okcdn.ru` — в
  этом окружении они НЕ грузятся (naturalWidth остаётся 0 даже без route-блока).
  Чтобы показать «загруженное» состояние — `page.route(...).fulfill()` локальной
  картинкой (напр. `assets/embedded/*.jpg`).
- ЛОВУШКА: при блокировке/слоу-сети `page.goto(url,{waitUntil:'load'})` таймаутит
  (load-event ждёт изображения). Бери `waitUntil:'domcontentloaded'`.
- Три состояния `<img>` для теста плейсхолдера: abort→`complete:true,naturalW:0`
  (+ браузер рисует свой broken-image глиф в углу); fulfill→`naturalW>0`;
  **route-handler без continue/abort/fulfill = pending** → `complete:false`,
  это и есть чистое «медленно грузится» БЕЗ broken-глифа. Для скрина плейсхолдера
  бери pending-режим, не abort.
- Плейсхолдер серого фото (правка stories-row.css): `.stories-row .avatar.__type-image
  > img` и `.stories-row__face` имеют `background-color: var(--dynamic-surface-base-primary)`
  → computed `rgb(247,244,242)` (#F7F4F2, light). Подтверждено: фон есть и в
  loading, и после загрузки (фото `object-fit:cover` перекрывает). lenta.html
  гейтом онбординга НЕ редиректит (в отличие от lenta-q3 / activity-lenta).

### ВВЗ-карточки — серый плейсхолдер под фото (vvz-card.css)
- `.vvz-card__media` (контейнер фото, НЕ `<img>`) имеет
  `background-color: var(--dynamic-surface-base-primary)` → computed
  `rgb(247,244,242)` (#F7F4F2 light). Общий для всех вариантов (__default/__message/
  __stories). Подтверждено в loading И loaded, переживает hard reload (статика CSS).
- `friends.html` = `.vvz-card.__default`: квадрат 220×220, radius 0, blur-подложка
  `.vvz-card__blur` (background-image webp). При route-pending фото И blur не
  рисуются → ровный серый квадрат, без леттербокса/битой картинки. После fulfill:
  фото object-fit:cover заполняет весь квадрат edge-to-edge (coversW/H == media box).
  Серого канта по краям НЕТ.
- `messages.html` = `.vvz-card.__message`: круг 96×96 radius 50%, БЕЗ blur. Loading —
  сплошной серый круг; loaded — фото в круге cover, без внутреннего серого кольца.
- Фото ВВЗ резолвятся people-data.js → ЛОКАЛЬНЫЕ `assets/people/vvz-*.webp` (есть в
  репе, грузятся в окружении). Чтобы поймать loading — route на
  `**/assets/people/vvz-*.webp` БЕЗ resolve (hold, НЕ abort: abort даёт broken-glyph).
  Для loaded — `route.fulfill` локальной opaque-jpg.
- НИ friends.html НИ messages.html НЕ редиректят на онбординг (нет afs-гейта).
  image-skeleton.js тут НЕ подключён, и `.vvz-card__media` не `.media/.avatar/.picture`
  → шиммера нет, плейсхолдер только через bg-color.
- ЛОВУШКА: `locator.screenshot()` карточки в loading таймаутит на «waiting for fonts»
  при pending-картинке. Бери `page.screenshot({clip, animations:'disabled'})` по
  boundingBox.

### activity-lenta/lenta.html — «красный линк» = «Посмотреть все ответы»
- Скролл-контейнер ленты — НЕ document: `.phone-frame__feed` (scrollHeight≈5268,
  client 844). `document.documentElement.scrollHeight==844` → скроллить надо
  `el.scrollTop`, иначе страница «не прокручивается».
- Единственный КРАСНЫЙ ТЕКСТ на странице: `.fc-more.__twitter-like` «Посмотреть все
  ответы» — кнопка-ссылка раскрытия ответов под каждым комментом твиттер-вью.
  computed `color: rgb(228,57,0)` (#E43900 — это resolved `--…status-accent` через
  button-inline `__view-primary`; токен задан #F64A00, но в light даёт #E43900).
  Селектор `.fc-list.__twitter-like .fc-more .button-inline` (повторяется ~6×).
  Это и есть «красный линк» в формулировке пользователя (выглядит как текст-ссылка,
  не бейдж/кнопка-капсула).
- `.pulse-dot` рядом с «Вокруг вас сейчас» — красный ДОТ через `background-color`
  rgb(246,74,0)=#F64A00, а не текст (это не линк). Сам заголовок `a.activity-header`
  («Вокруг вас сейчас», href=okruzhenie.html) — ЧЁРНЫЙ текст rgb(0,0,0), не красный.
- Прочий красный: иконка таб-бара `.tabbar-icon.__slot-feed.__state-on` (активная
  вкладка, цвет тоже #E43900) — не текст/линк.
- Правка «отключён редирект на add-friends»: скрипт-гейт из `<head>` УДАЛЁН целиком
  (не закомментирован условием) → ключ `afs-seen-al` больше НЕ ставится никогда.
  Подтверждено: first load / reload / fresh goto — все остаются на lenta.html,
  `#ll-stories-row` отсутствует, `afs-seen-al`=null во всех трёх. Т.е. для этого
  файла прежний совет «выставь afs-seen-al до goto» теперь НЕ нужен (гейта нет).
- `#ll-stories-row` удалён из разметки (ряд «Моменты» больше не рендерится).

### Бейдж верификации (people-data.js, `.ds-verified-row` + `.ds-badge-verified`)
- Механизм (data-driven, PASS во всех 3 путях). `DS_PEOPLE.apply(document)` оборачивает
  имя автора в `span.ds-verified-row` и добавляет `img.ds-badge-verified` СПРАВА, если
  автор verified. Цели селекторов: `.feed-header__name`, `.fc-comment__author`,
  `.caf__name`.
- Два пути матча: (1) `[data-person-name]` (New Vision, id-путь) → по id из
  `DS_PEOPLE.get(id).verified`; (2) без атрибута (Q3/Трибуна/Activity, имя литералом)
  → по СОВПАДЕНИЮ textContent с verifiedNames из листа «Люди».
- Verified сообщества (data/people.js): `group-zenit` = «ЗЕНИТ» Санкт-Петербург,
  `group-spb-news` = Телеканал «Санкт-Петербург». Имя для name-матча должно быть БУКВА
  В БУКВУ (кавычки-ёлочки «»).
- Замеры (390×844): `.ds-verified-row` display:flex (inline-flex в CSS), gap=**4px**
  (=var(--space-1)), бейдж **16×16**, badgeLeft−nameRight = 4px. Имя сохраняет
  ellipsis: whiteSpace nowrap, overflow hidden, textOverflow ellipsis, и реально
  усекается (scrollWidth−clientWidth = 67 в NV, 38 в Q3 при длинном имени).
- src бейджа резолвится относительно каталога скрипта: на корне `assets/badges/...`,
  в `new-vision/` → `../assets/badges/...` (resolveSrc). Оба → HTTP **200**.
- ИДЕМПОТЕНТНОСТЬ: повторный `apply()` НЕ дублирует — guard `parent.classList
  .contains('ds-verified-row')` ранний return. После apply×3 = ровно 1 бейдж.
- Контроль: неверифицированные авторы бейджа НЕ получают (проверено — «Чемпионат…»
  в Q3 и «Ольга Стрельникова» в твиттер-ряду без бейджа в том же кадре).
- twitter-like (`.fc-comment.__twitter-like .fc-comment__author`): после обёртки дата
  `span.ds-body-m.fc-comment__date` («· 12:48») остаётся СЛЕДУЮЩИМ сиблингом row →
  порядок имя·бейдж·дата корректный.
- lenta-q3.html ловит гейт онбординга (`afs-seen`); выставлял ОБА ключа
  `afs-seen`/`afs-seen-al` через addInitScript до goto — пропускает.

### Селекторы
- Навбар-«Поиск»: `[aria-label="Поиск"]` (top:18,left:350,24x24, flex/visible на
  q3). После прохождения гейта присутствует в 1 экземпляре в live DOM. Клик удобнее
  `el.click()` через `page.evaluate` — `locator.click({force})` всё равно ждёт
  attached/visible и таймаутит, если страница на самом деле на редиректе.

### tribune.html — кастомный «выбранный» чипс (2026-06-29)
- Чипсы Трибуны — `.ll-chips .chips-view__row .chip-container`. Выбранный делается
  кастомом: `__view-custom __selected-custom` + inline-style CSS-перем:
  `--chip-background-selected-color: #C93600; --chip-selected-color:#fff`.
  Computed (live, mobile 390): bg=rgb(201,54,0)=#C93600, color=rgb(255,255,255). OK.
- Невыбранные `__view-primary`: bg=rgba(131,102,86,0.12), color rgb(0,0,0).
- Иконка выбранного чипса белая через inline `filter: brightness(0) invert(1)` на
  `<img.ll-icon>` (SVG не имеет своего currentColor → красят фильтром). Это норма.
- Статическая разметка → переживает reload/fresh goto без изменений (нет JS-гейта,
  нет sessionStorage). Подтверждено reload: bg/color/sel идентичны.
