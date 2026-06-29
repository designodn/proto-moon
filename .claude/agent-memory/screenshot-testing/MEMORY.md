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

_(пока пусто — заполняется по мере прогонов)_

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

### Селекторы
- Навбар-«Поиск»: `[aria-label="Поиск"]` (top:18,left:350,24x24, flex/visible на
  q3). После прохождения гейта присутствует в 1 экземпляре в live DOM. Клик удобнее
  `el.click()` через `page.evaluate` — `locator.click({force})` всё равно ждёт
  attached/visible и таймаутит, если страница на самом деле на редиректе.
