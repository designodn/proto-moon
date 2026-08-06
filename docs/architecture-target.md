# Целевая архитектура proto-moon

Документ отвечает на один вопрос: **как этот репозиторий должен быть устроен**, чтобы
он выдержал три вещи, ради которых существует, — жить рядом с корпоративным ДС, который
мы не контролируем; принимать правки от людей, которых мы не контролируем; быть
скопированным в проект другого бизнес-юнита.

**Критерий правильности — архитектурный.** Стоимость миграции, конфликты в открытых
ветках, поломка публичных ссылок, привычки команды — это свойства *перехода*. Они
определяют порядок и способ работ и никогда — ответ на вопрос «как правильно».
Архитектурное решение отменяется только доказательством, что оно не решает задачу или
создаёт новую. «Дорого» и «сломается» — не доказательства: сломается, значит, чиним, и
починка стоит в плане.

**Как читать.** Раздел 1 — целевое состояние и инварианты; это и есть ответ. Раздел 2 —
чем сегодняшний репозиторий от него отличается, с замерами. Раздел 3 — решения готовыми
артефактами. Раздел 4 — порядок перехода. Раздел 5 — то, что мы не вправе решить сами.
Раздел 6 — как всё проверялось.

Все числа замерены на коммите `5436c38`; сводка замеров и метод — приложение Б.

---

## 1. Целевое состояние

### 1.1. Раскладка

Три корзины, разделённые **по происхождению и праву на правку**, а не по «примитивности»
компонента:

```
ds/                      ← апстрим корпоративного ДС. Не правим. Обновляется только
  tokens.css                конверсией/переносом сверху.
  typography.css
  animations.css
  fonts.css  fonts/
  components/            ← только файлы с DS-Origin: upstream
  assets/icons/
  index.css              ← точка входа ДС: импортирует ТОЛЬКО ds/
  preview.html           ← витрина чистого ДС

ds-local/                ← наши расширения ДС. Правим. Кандидаты «наверх», в апстрим.
  components/            ← карта __slot-*, дописки к button, button-circle, tag,
                            promo-banner, type-scale, поведенческий JS
  index.css              ← @import '../ds/index.css' + свои

app/                     ← приложение. Пишется заново под каждый бизнес-юнит.
  app.css                ← @import '../ds-local/index.css' + app/components
  components/            ← продуктовое: feed-*, vvz-*, clip-*, gift-card, nv-*, koleso-*
  *.html                 ← экраны
  activity-lenta/  events-lenta/  new-vision/  koleso/
  data/
  assets/                ← всё, кроме icons

scripts/  docs/  .githooks/  .github/  server.mjs   ← инфраструктура и правила
```

Проверка правильности границы — одним действием: **скопировать `ds/` и `ds-local/` в
пустой репозиторий и открыть `ds/preview.html`. Витрина должна открыться без единой
правки пути.** Сегодня это невозможно (см. 2.1, I3), и именно эта невозможность —
единственная причина реорганизации. Не чистота корня.

### 1.2. Инварианты

Одиннадцать свойств, каждое из которых либо выполняется, либо является долгом с датой и
владельцем. Формулировка — утвердительная и проверяемая; «чем удерживается» — механизм,
а не намерение.

| # | Инвариант | Зачем | Чем удерживается |
|---|---|---|---|
| **I1** | У каждого файла в `ds/` и `ds-local/` объявлено происхождение: `DS-Origin`, `DS-Source`, `DS-Snapshot`, `DS-Local-Patch`. Значение `unknown` допустимо; **отсутствие поля — нет** | Без этого нельзя ответить «что можно править» и «что копировать в другой БЮ». Это первый вопрос при любом переезде и при любом апдейте | Р2 (шапка), Р3 (манифест), линтер R12 |
| **I2** | Апстримный файл не правится на месте. Наше расширение живёт в `ds-local/` отдельным файлом. Дифф файла `ds/` против его снапшота — пустой | Правка внутри апстримного файла делает любой будущий апдейт конфликтом. Сегодня это уже случилось с `button.css` и `icon.css` | Р2 (поле `DS-Local-Patch`), Р11 (вопрос ревьюера), линтер R13 |
| **I3** | Точка входа ДС не знает о приложении. `ds/index.css` импортирует только `ds/`. Копирование `ds/` + `ds-local/` в другой проект — копирование папок, ноль правок | Иначе «взять ДС» означает «вычистить чужой продукт из точки входа», то есть ручную работу при каждом копировании | Р7 (разделение точек входа), линтер R14 |
| **I4** | Публичный адрес прототипа — контракт. Путь в файловой системе — не контракт. Адрес переживает перемещение файлов на **всех** каналах публикации | Пока адрес == путь, любое улучшение структуры оплачивается поломкой чужих ссылок. Это делает архитектуру заложником файловой раскладки | Р8 (слой адресов), `docs/urls.md` как источник истины |
| **I5** | Новый вариант прототипа не копирует страницы. Прототип — это надстройка над общим набором экранов (как `new-vision/`), а не их копия (как `events-lenta/`) | Копия означает, что каждое изменение ДС применяется N раз вручную и расходится. Уже разошлось | `docs/structure.md` правило 2, ревью |
| **I6** | Сгенерированное отделено от написанного и воспроизводимо без сети. Всё между `FEED:START`/`FEED:END` — только машинное. Каждый генератор поддерживает `--offline` | Пока реген требует сети и живой таблицы, «перегенерируется» не равно «восстановимо». Любая структурная правка упирается в доступ к чужому сервису | Линтер R11 (жёсткое), контракт генератора (Р10) |
| **I7** | Рантайм прототипа не зависит от чужих сетей. Все шрифты, библиотеки и изображения — локальные | Прототип должен открываться через год и без интернета. Плюс `pravatar`/`picsum` — чужие лица на нашем публичном адресе | Линтер R15, `docs/structure.md` правило 10 |
| **I8** | Прототип не индексируется ни на одном канале публикации | В репозитории 38 реальных имён и 38 фотографий живых людей, а публикуется он на трёх каналах | Р1 (`robots.txt` + `<meta>`), проверка канала при добавлении нового |
| **I9** | `main` достижим только через PR, прошедший проверки. Проверки живут на стороне репозитория, а не в окружении автора правки | Правило, которое можно обойти, сменив редактор, — не правило | Р5 (линтер), Р6 (workflow), Р9 (защита ветки) |
| **I10** | Конфигурация не объявляет возможностей, которых нет в коде. Процесс, раздающий статику, не имеет права записи в источник истины | Сегодня `docker-compose.yml` раздаёт `GITHUB_TOKEN` и ключи бакета под функциональность, которой в `server.mjs` нет. Это одновременно ложь конфигурации и лишние привилегии | Р4 (вычистить), архитектурный запрет на автокоммит с раздающего процесса |
| **I11** | Правило либо действует для всего репозитория, либо его нет. Легаси не смягчает правило, а попадает в явный **baseline**, который может только уменьшаться | Правило с исключениями «потому что так исторически» перестаёт быть правилом через один спор | `docs/baseline.json` (Р5), запрет на рост baseline в CI |

Отдельно — **что инвариантами НЕ является**, чтобы это не путали с архитектурой: число
страниц в корне, красота имён папок, количество прототипов. Это следствия, а не цели.

---

## 2. Разрыв

### 2.1. Инвариант против сегодняшнего состояния

| Инвариант | Сегодня | Замер |
|---|---|---|
| **I1** происхождение объявлено | **Нарушен.** Заголовок `Source:` есть у **11 из 82** CSS в `components/`: 8 апстримных (`button`, `button-inline`, `content`, `contents-view`, `icon`, `tooltip`, `uni-card`, `uni-cell`) и 3 «сверстано по Figma» (`button-circle`, `tag`, `promo-banner`). У **71** файла — ничего. Восстановить из истории нельзя: клон shallow | `grep -l 'Source:' components/*.css` |
| **I2** апстрим не правится на месте | **Нарушен, и это уже стоило нам обновляемости.** `components/button.css` несёт `Source: …/Button.styl` и содержит наши дописки на строках 167-175 (инверсия глифа в тёмной теме), 177-193 (`__style-positive/negative/destructive`), 206-208 (`__style-ai-gift` с захардкоженным градиентом). `components/icon.css` — апстримная база плюс **локально изобретённая** карта 30 слотов `__slot-*` (строки 79-108), которой в апстриме нет вовсе | чтение файлов |
| **I3** вход ДС не знает о приложении | **Нарушен.** `index.css` — 73 `@import`, из них **15** тянут продуктовое: `vvz-card`, `clip-vvz`, `meshok-up`, 10 `feed-*`, `gift-card`, `friend-big-card`. Кроме того `tokens.css:100-126` приклеивает типографические классы `ds-*` к селекторам компонентов (`.header.__size-l .header__subtitle`, `.button-inline.__size-24`, `.text-input.__size-56`) — то есть файл токенов знает о компонентах | `grep -c '@import' index.css`, чтение `tokens.css` |
| **I4** адрес — контракт | **Отсутствует как понятие.** Красивые адреса (`/q3`, `/activity`, `/nv`, `/events`, `/preview`) существуют только в `server.mjs:27-33` — то есть только на VM. GitHub Pages (`deploy-pages.yml`, `path: '.'`) и SourceCraft Sites (`.sourcecraft/sites.yaml`, `ref: main`) отдают корень как есть: там адрес == путь | чтение конфигов |
| **I5** прототип не копирует страницы | **Нарушен.** `events-lenta/` — копия `activity-lenta/`, уже разошедшаяся: `lenta.html` — 974 изменённых строки, `okruzhenie.html` — 544, `view.html` — 14, `add-friends-sheet.html` — 20 | `diff a b \| grep -cE '^[<>]'` |
| **I6** генерируемое воспроизводимо офлайн | **Нарушен наполовину.** Флаг `--offline` есть у **4 генераторов из 9** (`fetch-feed`, `fetch-marathon`, `fetch-profile`, `fetch-q3`); остальным нужен доступ к Google-таблице. `sheet-cache` пропустит шаг без `--force`; `fetch-all.mjs` не стартует без `sharp`. При этом 692 из 1512 ссылок на `assets/` в HTML лежат внутри `FEED`-блоков | `grep -ln offline scripts/fetch-*.mjs` |
| **I7** рантайм локален | **Нарушен.** `cdn.jsdelivr.net/npm/lottie-web@5.12.2` — на 11 страницах; в HTML: `fonts.googleapis.com` 76, `i.pravatar.cc` 79, `picsum.photos` 15, `okcdn.ru` 38 | `git grep -o` по HTML |
| **I8** не индексируется | **Нарушен на двух каналах из трёх — P0.** `X-Robots-Tag: noindex` стоит в `server.mjs:100`, роут `/robots.txt` — в `server.mjs:103`. Файла `robots.txt` в репозитории **нет**; `<meta name="robots">` в HTML — **0 вхождений**. На Pages и SourceCraft Sites прототип отдаётся без каких-либо ограничений, а в нём `data/people.json` с **38** реальными именами и `assets/people/` — **38** фотографий, 4 МБ | `ls robots.txt`, `git grep -i noindex -- '*.html'` |
| **I9** `main` только через проверенный PR | **Нарушен — P0.** Workflow с триггером `pull_request` — **ни одного**; оба существующих (`deploy-pages.yml`, `mirror-sourcecraft.yml`) — на `on: push`. Единственная автопроверка — `.githooks/pre-commit`, включаемый SessionStart-хуком `.claude/settings.json`, то есть только у владельца в Claude Code | чтение `.github/workflows/*` |
| **I10** конфигурация не врёт | **Нарушен — P0.** `docker-compose.yml:15-31` раздаёт `SYNC_ON_START`, `GITHUB_TOKEN`, `SYNC_GIT_PUSH_URL`, `SYNC_GIT_BRANCH=main`, `SYNC_GIT_COMMIT`, весь блок `UPLOADS_*` (ключи S3) и утверждает в комментарии, что «`server.mjs`/пайплайн пишут и отдают медиа из бакета». В `server.mjs` (163 строки) нет ни роута `/content`, ни `upload`, ни S3, ни синка, ни git — все совпадения по этим словам оказались `Content-Type` и `viewport … content=`. `scripts/lib/bucket.mjs` вызывается только из трёх разовых скриптов (`check-bucket`, `migrate-assets`, `migrate-clips`) | чтение `server.mjs`, `docker-compose.yml`, `git grep bucket` |
| **I11** правило действует целиком | **Отсутствует как механизм.** В HTML 426 литералов цвета и 135 `rgba(`, в `components/*.css` — 138 литералов, инлайн-`style="` — 616, `<style>`-блоки на 45 страницах из 46. Правила `CLAUDE.md` («никакого хардкода») сегодня не выполняются массово, и никакого учёта этого долга нет | `git grep -o` |

### 2.2. Три находки, требующие действия немедленно

Это не «первый этап плана». Это то, что вредит, пока документ читают.

**P0-1. Прототип с персональными данными публикуется без запрета индексации.**
`noindex` есть только на VM-канале (`server.mjs:100`). На GitHub Pages и SourceCraft
Sites нет ни заголовка, ни `robots.txt`, ни `<meta>`. Публикуются 38 реальных имён и 38
фотографий. Каждый push в `main` переопубликовывает это заново. Решение — Р1, объём —
один файл и одна строка в шаблоне страниц.

**P0-2. Прямой push в `main` уезжает в прод на три канала без единой проверки.**
Ни одного `pull_request`-workflow; локальный хук включается только у владельца.
Любая ошибка публикуется мгновенно на Pages, SourceCraft Sites и VM. Решение — Р5, Р6,
Р9.

**P0-3. Конфигурация раздаёт секреты под несуществующую функциональность.**
`GITHUB_TOKEN` с правом пуша в `main` и ключи S3 прокидываются в контейнер ради кода,
которого нет. Это лишние привилегии у процесса, который по архитектуре (I10) вообще не
должен иметь права записи в источник истины. Решение — Р4.

### 2.3. Baseline: долг, а не исключения

Инвариант I11 запрещает смягчать правило ради легаси. Вместо этого нарушения
фиксируются списком, который **может только уменьшаться**. Это единственный честный
способ ввести правило в живой репозиторий: правило действует с первого дня для всего
нового, а старое видно, посчитано и имеет владельца.

| ID | Долг | Объём на дату замера | Против чего |
|---|---|---|---|
| D-1 | Файлы ДС без объявленного происхождения | 71 из 82 CSS | I1 |
| D-2 | Дописки внутри апстримных файлов | `button.css` (3 блока), `icon.css` (карта 30 слотов) | I2 |
| D-3 | Продуктовые импорты в точке входа ДС | 15 из 73 `@import` | I3 |
| D-4 | Типографические классы, приклеенные к селекторам компонентов в `tokens.css` | строки 100-126 | I3 |
| D-5 | Прототип-копия | `events-lenta/` (974 + 544 расхождения) | I5 |
| D-6 | Генераторы без `--offline` | 5 из 9 | I6 |
| D-7 | Внешние сети в рантайме | jsdelivr на 11 страницах; 79 `pravatar`, 15 `picsum`, 76 `googleapis` в HTML | I7 |
| D-8 | Литералы дизайн-значений | 426 hex + 135 `rgba(` в HTML; 138 hex в `components/*.css`; 616 инлайн-`style=` | I11 |
| D-9 | Страницы без общей точки входа стилей | 5 (`new-vision.html`, `start-lenta.html`, `q3-view.html`, `activity-lenta/view.html`, `events-lenta/view.html`) | I3 |
| D-10 | Прототипы без объявленного режима изоляции | `new-vision/` и `koleso/` — 0 тегов `<base href>`, 0 подключений `proto-contain.js` | I5 |
| D-11 | Мусор в дереве | папка `assets ` (5 файлов, 500 КБ), `feed-content.json`, `comment-as-feed-twitter.html`, `.deploy-trigger`, `.fig2.png`, `assets/post_crop_small_1080 (2) 1.png` — у всех 0 входящих ссылок | гигиена |
| D-12 | Документация, расходящаяся с кодом | `README.md:10-35` (4 несуществующих файла), `UPLOADS.md` (несуществующая страница `/content`), комментарий `docker-compose.yml` | I10 |
| D-13 | 209 открытых веток, содержимое 188 непроверяемо | merge-base с `main` доступен у 21 из 210 (клон shallow) | гигиена |
| D-14 | Механизм сопровождения правил объявлен, но не заведён | `macket-insights-curator` описан как работающий «раз в неделю по крону» (`CLAUDE.md:105`, `macket-insights-curator.md:3`, `kirill.md:927`); планировщика в репозитории нет — `grep -rn 'schedule\|cron' .github/workflows/ .sourcecraft/` пусто | I9 |

Формат хранения — `docs/baseline.json` (см. Р5). CI сравнивает текущий счётчик с
записанным и валит сборку при **росте**. Уменьшение — молча принимается и перезаписывает
файл.

---

## 3. Решения

Каждое решение — готовый артефакт. Где артефакт нельзя дописать без чужого решения,
стоит явная дырка со ссылкой на вопрос из раздела 5. Помета типа внешнего источника:
**[док]** — документация вендора/инструмента, **[инж]** — инженерный блог или заметки
практика, **[форум]** — живой опыт. ✅ — страницу открывал лично; ○ — источник из выдачи
поиска, страницу не открывал.

---

### Р1. Запрет индексации на всех каналах — I8

**Файл `robots.txt` в корне репозитория** (публикуется как есть и на Pages, и на
SourceCraft Sites):

```
User-agent: *
Disallow: /
```

**Строка в `<head>` каждой страницы** — единственный способ, который работает и на
статических каналах, и переживает будущий перенос файлов:

```html
<meta name="robots" content="noindex, nofollow">
```

`server.mjs` продолжает отдавать `X-Robots-Tag` (строка 100) — они не конфликтуют.

Раскладка `<meta>` по 46 страницам — механическая правка, её делает тот же прогон, что и
Р2. Новое правило: страница без этого тега не проходит линтер (правило R16), поэтому
проблема не вернётся.

**Что это не решает.** Запрет индексации не делает публичный адрес приватным. Ссылку
по-прежнему можно переслать. Нужен ли прототипу с персональными данными настоящий
контроль доступа — **вопрос 1**, это решение владельца данных, а не архитектора.

**Как решают снаружи.** GitHub Pages не даёт управлять заголовками ответа, поэтому
единственный доступный на статическом канале механизм — файл `robots.txt` в корне
публикуемой папки плюс `<meta name="robots">`. Разбора именно для связки
«Pages + приватные данные» **не нашёл** — искал, релевантного материала не попалось.

---

### Р2. Объявленное происхождение файлов ДС — I1, I2

**Шаблон шапки.** Первый блок комментария в файле; формат одинаков для `.css` и `.js`.

```css
/**
 * DS-Origin:      upstream | upstream+local | figma | local | unknown
 * DS-Source:      <путь в апстриме> | figma:<fileKey>#<nodeId> | —
 * DS-Snapshot:    <ревизия апстрима или дата снятия YYYY-MM-DD> | unknown
 * DS-Local-Patch: <что дописано нами и где> | —
 */
```

**Три заполненных примера из этого репозитория** — по одному на тип происхождения.

`ds/components/uni-card.css` — чистый апстрим:

```css
/**
 * DS-Origin:      upstream
 * DS-Source:      design-system/components/UniCard/UniCard.styl
 * DS-Snapshot:    unknown          ← см. вопрос 2
 * DS-Local-Patch: —
 */
```

`ds/components/button.css` — апстрим, у которого сегодня есть необъявленные дописки.
Шапка фиксирует факт; сам вынос дописок в `ds-local/` — долг D-2:

```css
/**
 * DS-Origin:      upstream+local
 * DS-Source:      design-system/components/Button/Button.styl
 * DS-Snapshot:    unknown          ← см. вопрос 2
 * DS-Local-Patch: 167-175 инверсия монохромного глифа в тёмной теме;
 *                 177-193 .__style-positive / .__style-negative / .__style-destructive;
 *                 206-208 .__style-ai-gift (градиент, Figma node 4833:57273);
 *                 ДОЛГ D-2: вынести в ds-local/components/button-ext.css
 */
```

`app/components/feed-header.css` — наше продуктовое (сегодня без всякой шапки):

```css
/**
 * DS-Origin:      local
 * DS-Source:      —
 * DS-Snapshot:    —
 * DS-Local-Patch: —
 */
```

**Объём:** 121 файл (82 CSS + 35 JS + `tokens.css`, `index.css`, `animations.css`,
`fonts.css`); для 11 данные уже есть в существующих заголовках `Source:`. Ни один путь
не меняется.

**Дырка:** `DS-Snapshot` невозможно заполнить, пока неизвестна ревизия, из которой снят
слепок, и чем он конвертирован — **вопрос 2**. До ответа во всех апстримных файлах стоит
`unknown`, и это честнее правдоподобной даты. Классификация 71 файла без `Source:`
упирается в **вопрос 3**.

Для `tokens.css` шапка неприменима — файл сам объявляет «Auto-converted from Stylus. Do
not edit manually»; его происхождение живёт в манифесте (Р3).

**Как решают снаружи.** ✅ [док] Chromium требует для каждой вендоренной зависимости файл
`README.chromium` с обязательными полями `Name`, `URL`, `License`, `Shipped`,
`Security Critical`, **`Update Mechanism`** (одно из `Autoroll | Manual | Static |
Static.HardFork`), `Description` и **`Local Modifications`**
([README.chromium.template](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/README.chromium.template)).
Наши четыре поля — прямая калька. ✅ [инж] Там же правило, которое стоит забрать
дословно: не переформатировать код внутри зависимости, потому что «сохранение
оригинального форматирования обязательно для получения чистых диффов с апстримом»
([adding_to_third_party](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/adding_to_third_party.md)).
○ [док] Debian держит локальные правки отдельными патчами с DEP-3-заголовками
([gbp.patches](https://honk.sigxcpu.org/projects/git-buildpackage/manual-html/gbp.patches.html));
npm/pnpm — `.patch`-файлом, записанным в манифесте
([обзор](https://nesbitt.io/2026/05/01/patching-and-forking-in-package-managers.html)).

**Что нам не подходит и почему.** Патч-подход (Debian, `patch-package`) требует
доступной pristine-копии апстрима, чтобы сгенерировать дифф. У нас её нет, а локальная
копия ещё и сконвертирована из Stylus в CSS вручную. Поэтому `DS-Local-Patch` —
описание словами, а не машинный патч. Это ограничение снимается только ответом на
**вопрос 2**; закрывать его самодельным «почти патчем» — создавать новую проблему.

---

### Р3. `docs/ds-manifest.md` — сводка происхождения — I1

**Как выглядит файл:**

```markdown
# Манифест ДС

Сгенерировано `node scripts/ds-manifest.mjs`. Руками не править — источник истины
шапки DS-Origin в самих файлах.

| Файл | Origin | Source | Snapshot | Наши дописки | В другой БЮ |
|---|---|---|---|---|---|
| `ds/components/uni-card.css` | upstream | `design-system/components/UniCard/UniCard.styl` | unknown | — | да |
| `ds/components/button.css` | upstream+local | `design-system/components/Button/Button.styl` | unknown | 167-175, 177-193, 206-208 | да, с дописками |
| `app/components/feed-header.css` | local | — | — | — | нет |
```

**Генератор целиком** — ESM, Node 20+, без зависимостей:

```js
#!/usr/bin/env node
/**
 * ds-manifest.mjs — собирает docs/ds-manifest.md из шапок DS-Origin.
 * Запуск: node scripts/ds-manifest.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['ds/components', 'ds-local/components', 'app/components', 'components'];
const EXTRA = ['ds/tokens.css', 'ds/index.css', 'ds/animations.css', 'ds/fonts.css',
               'tokens.css', 'index.css', 'animations.css', 'fonts.css'];

const files = [
  ...DIRS.filter((d) => existsSync(join(ROOT, d)))
         .flatMap((d) => readdirSync(join(ROOT, d))
                          .filter((f) => /\.(css|js)$/.test(f))
                          .map((f) => `${d}/${f}`)),
  ...EXTRA.filter((f) => existsSync(join(ROOT, f))),
];

const field = (src, name) => {
  const m = new RegExp(`^\\s*\\*\\s*${name}:\\s*(.+)$`, 'm').exec(src);
  return m ? m[1].trim() : '';
};
const CARRY = { upstream: 'да', 'upstream+local': 'да, с дописками',
                figma: 'да, с дописками', local: 'нет', unknown: '?' };

const rows = files.map((rel) => {
  const src = readFileSync(join(ROOT, rel), 'utf8').slice(0, 2000);
  const origin = field(src, 'DS-Origin') || 'unknown';
  return `| \`${rel}\` | ${origin} | ${field(src, 'DS-Source') || '—'} `
       + `| ${field(src, 'DS-Snapshot') || '—'} `
       + `| ${field(src, 'DS-Local-Patch') || '—'} | ${CARRY[origin] ?? '?'} |`;
});

writeFileSync(join(ROOT, 'docs/ds-manifest.md'),
  '# Манифест ДС\n\nСгенерировано `node scripts/ds-manifest.mjs`. Руками не править — '
  + 'источник истины\nшапки DS-Origin в самих файлах.\n\n'
  + '| Файл | Origin | Source | Snapshot | Наши дописки | В другой БЮ |\n'
  + '|---|---|---|---|---|---|\n' + rows.join('\n') + '\n');

const unknown = rows.filter((r) => r.includes('| unknown |')).length;
console.log(`ds-manifest: ${rows.length} файлов, без объявленного происхождения — ${unknown}`);
process.exit(0);
```

Счётчик `unknown` в конце — метрика долга D-1, видна одной командой.

**Как решают снаружи.** ✅ [док/инж] Та же схема у Chromium: метаданные лежат рядом с
кодом машинно-читаемым файлом, сводка получается обходом дерева. ○ [док] Вторая
распространённая форма — реестр правок в манифесте пакета (`patchedDependencies` у pnpm),
[обзор](https://nesbitt.io/2026/05/01/patching-and-forking-in-package-managers.html).
**Не подходит:** инвентаризация через Storybook — самый частый совет в мире дизайн-систем
— требует сборки и рантайма, которых в проекте нет.

---

### Р4. Убрать несуществующую функциональность из конфигурации — I10

**Из `docker-compose.yml` удаляются строки 15-31** — весь блок `SYNC_*`, `GITHUB_TOKEN`
и `UPLOADS_*`, вместе с комментарием, утверждающим, что `server.mjs` пишет в бакет.
`UPLOADS.md` либо удаляется, либо получает первой строкой:

```markdown
> **Статус: не реализовано.** Описанного здесь роута `/content` в `server.mjs` нет.
> Документ сохранён как проект; прежде чем включать — см. docs/architecture-target.md,
> инвариант I10 и вопрос 5.
```

Зависимость `@aws-sdk/client-s3` остаётся: её используют три разовых скрипта
(`check-bucket.mjs`, `migrate-assets.mjs`, `migrate-clips.mjs`) — они живые, просто не
часть пайплайна.

**Архитектурное требование на будущее, а не оценка.** Если контур загрузки медиа вернут,
он не может быть реализован так, как описан. Раздающий процесс не имеет права коммитить
в `main` (I10): автокоммит с VM обходит PR, обходит защиту ветки и обходит линтер, то
есть отменяет I9 целиком. Правильная форма — отдельный сервис или скрипт, который
создаёт **ветку и PR**, а не пишет в `main`. Это условие включения, а не пожелание.
**Вопрос 5** — вернут ли контур вообще.

**Как решают снаружи.** Специального разбора кейса «конфиг раздаёт секреты под
несуществующую фичу» **не нашёл**. Смежное общее правило — наименьшие привилегии, но
ссылки, которую стоило бы привести, не нашёл.

---

### Р5. `scripts/lint-macket.mjs` — правила на стороне репозитория — I9, I11

Детерминированный линтер без зависимостей, по образцу существующего `scripts/nbsp.mjs`.
Все правила — **жёсткие**: инвариант I11 запрещает «предупреждения ради легаси». Легаси
живёт в `docs/baseline.json`, а не в понижении строгости.

#### Правила

| # | Детекция | Нарушение | Сообщение |
|---|---|---|---|
| R1 | Собрать `/(?:src\|href)="([^"]+)"/g` и `/url\(\s*['"]?([^)'"]+)/g`; отбросить `^(https?:)?//`, `#`, `data:`, `mailto:`, `tel:`, `javascript:`. База: файл начинается со строки `^<base href="../">` → резолв от корня репо, иначе от папки файла. Существование — посегментной сверкой с `readdirSync` | Файла нет или отличается регистром | `битый путь ассета: «{path}» не существует (или отличается регистром)` |
| R2 | `/<img[^>]+src="[^"]*back_24\.svg"/i` | Совпадение | `кнопка «назад» через <img back_24.svg> — это шеврон «‹». Нужен <span class="icon __size-24 __slot-back">` |
| R3 | Разрешённые размеры вычитать из `avatar.css`: `/^\.avatar\.__size-(\d+)/gm`. В разметке: `/class="[^"]*\bavatar\b[^"]*__size-(\d+)/g` | Размера нет в `avatar.css` | `.avatar.__size-{N} — такого размера нет в avatar.css. Доступны: {список}` |
| R4 | В срезе до `</head>` искать `/<script[^>]*src="[^"]*screen-transition\.js"[^>]*>/` | На странице есть `nav-bar__back`, а тега в `<head>` нет; либо у тега `defer`/`async`; либо он ниже `</head>` | `screen-transition.js обязан быть синхронным <script src> в <head> — иначе «назад» играет анимацию вперёд` |
| R5 | По добавленным файлам: каждый сегмент пути против `/^[a-z0-9]+(?:[-.][a-z0-9]+)*$/` | Пробел, скобка, заглавная, кириллица | `имя «{path}» не в kebab-case — см. docs/structure.md, правило 3` |
| R6 | Распарсить `TAB_ALLOW_OUT` и `TAB_ROUTES` из `proto-contain.js`; на странице найти `/class="[^"]*tabbar-icon[^"]*__slot-([a-z]+)/g` | Цель вне папки страницы, слот не в `TAB_ALLOW_OUT`, нет `__state-on` | `слот «{slot}» ведёт на {href} за пределы {dir}, но его нет в TAB_ALLOW_OUT — таб молча не сработает` |
| R7 | Для файлов с `^<base href="../">`: `/(?:src\|href)="\.\.\//` | Совпадение | `на странице с <base href="../"> пути считаются от корня репо — «../» лишний` |
| R8 | `spawnSync('node', ['scripts/nbsp.mjs','--check', …html])` | Код выхода 1 | `неразрывные пробелы не расставлены. Прогони: node scripts/nbsp.mjs {файлы}` |
| R9 | `/#[0-9a-fA-F]{3,8}\b\|rgba?\(\|hsla?\(\|\b(?:white\|black)\b/` | Совпадение вне baseline | `литерал цвета — возьми токен из tokens.css` |
| R10 | `/(?:padding\|margin\|gap)\s*:\s*(\d+)px/` со сверкой по `{4:--space-1, 8:--space-2, 12:--space-3, 16:--space-4, 20:--space-5, 24:--space-6}` | Совпадение вне baseline | `{N}px → var({token})` |
| R11 | Номер строки попадает между `FEED:START` и `FEED:END` | Правка внутри маркеров | `это генерируемый блок, правка будет затёрта. Меняй лист таблицы или шаблон в scripts/fetch-*.mjs` |
| R12 | В файле `ds/` или `ds-local/` нет `/^\s*\*\s*DS-Origin:/m` | Отсутствие поля | `файл ДС без объявленного происхождения — добавь шапку, см. docs/structure.md, правило 4` |
| R13 | Дифф трогает файл с `DS-Origin: upstream` | Любая правка | `правка внутри апстримного файла. Расширение кладётся в ds-local/, см. инвариант I2` |
| R14 | В `ds/index.css` — `@import`, чей путь выходит за `ds/` | Совпадение | `точка входа ДС не может импортировать приложение (I3)` |
| R15 | `/(?:src\|href)="https?:\/\//` в HTML, кроме списка разрешённых доменов (сегодня пуст) | Совпадение вне baseline | `внешняя сеть в рантайме — положи локально через scripts/lib/media-cache.mjs (I7)` |
| R16 | В `<head>` нет `<meta name="robots" content="noindex, nofollow">` | Отсутствие | `страница без запрета индексации (I8)` |

**Дырка:** R3 сегодня пропустит `.avatar.__size-126` — он определён в `avatar.css:79` с
пометкой `/* legacy */`, но отсутствует и в шапке файла, и в чек-листе агента. Считать
ли legacy-размер валидным — **вопрос 6**. До ответа правило читает `avatar.css` как есть.

#### `docs/baseline.json` — механика долга

```json
{
  "_": "Счётчики существующих нарушений. Расти не могут. Обновляется только вниз.",
  "generated": "<дата прогона>",
  "counts": {
    "R9":  { "total": 564, "note": "426 hex + 135 rgba в HTML, 138 hex в components/*.css" },
    "R12": { "total": 110, "note": "121 файл ДС минус 11 с существующим Source:" },
    "R15": { "total": 181, "note": "11 страниц jsdelivr, 79 pravatar, 15 picsum, 76 googleapis" },
    "R16": { "total": 46,  "note": "все страницы без meta robots" }
  }
}
```

CI считает нарушения по всему дереву и сравнивает с `counts`. **Больше — сборка падает.
Меньше — файл перезаписывается и коммитится вместе с правкой.** Правило действует с
первого дня для всего нового; старое видно и сокращается.

#### Каркас — рабочий код

```js
#!/usr/bin/env node
/**
 * lint-macket.mjs — правила сборки макетов.
 *
 *   node scripts/lint-macket.mjs --diff origin/main   — новые нарушения в диффе
 *   node scripts/lint-macket.mjs --baseline           — пересчёт docs/baseline.json
 *   node scripts/lint-macket.mjs                      — по staged (для pre-commit)
 *
 * Выход: 1 — есть нарушение вне baseline либо baseline вырос; иначе 0.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const BASE = argv.includes('--diff') ? argv[argv.indexOf('--diff') + 1] : null;
const REBASE = argv.includes('--baseline');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });

function changedFiles() {
  const out = BASE
    ? git('diff', '--name-only', '--diff-filter=ACMR', `${BASE}...HEAD`)
    : git('diff', '--cached', '--name-only', '--diff-filter=ACMR');
  return out.split('\n').filter(Boolean).filter((f) => existsSync(join(ROOT, f)));
}

function allFiles() {
  return git('ls-files').split('\n')
    .filter((f) => /\.(html|css|js|mjs)$/.test(f));
}

/** Добавленные строки — [[номер, текст], …] */
function addedLines(file) {
  const range = BASE ? [`${BASE}...HEAD`] : ['--cached'];
  const patch = git('diff', ...range, '--unified=0', '--', file);
  const res = []; let n = 0;
  for (const l of patch.split('\n')) {
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(l);
    if (m) { n = Number(m[1]); continue; }
    if (l.startsWith('+') && !l.startsWith('+++')) res.push([n++, l.slice(1)]);
    else if (!l.startsWith('---')) n++;
  }
  return res;
}

/** Существование пути с точной проверкой регистра. */
function existsExact(abs) {
  const rel = relative(ROOT, abs);
  if (rel.startsWith('..')) return false;
  let cur = ROOT;
  for (const seg of rel.split('/')) {
    let entries; try { entries = readdirSync(cur); } catch { return false; }
    if (!entries.includes(seg)) return false;
    cur = join(cur, seg);
  }
  return true;
}

const findings = [];
const hit = (rule, file, line, msg) => findings.push({ rule, file, line, msg });

/** Правила, считаемые по всему файлу (для baseline) и по диффу (для PR). */
function scanFile(f, src) {
  const baseRoot = /^<base href="\.\.\/">/m.test(src);
  const from = baseRoot ? ROOT : join(ROOT, dirname(f));
  const lineOf = (i) => src.slice(0, i).split('\n').length;

  for (const m of src.matchAll(/(?:src|href)="([^"]+)"|url\(\s*['"]?([^)'"]+)/g)) {
    const p = (m[1] ?? m[2]).trim();
    if (/^(https?:)?\/\/|^(#|data:|mailto:|tel:|javascript:|blob:)/.test(p)) continue;
    const clean = p.split(/[?#]/)[0];
    if (clean && !existsExact(resolve(from, clean)))
      hit('R1', f, lineOf(m.index), `битый путь ассета: «${clean}»`);
  }
  const back = /<img[^>]+src="[^"]*back_24\.svg"/i.exec(src);
  if (back) hit('R2', f, lineOf(back.index),
    'кнопка «назад» через <img back_24.svg>; нужен <span class="icon __size-24 __slot-back">');

  if (baseRoot) for (const m of src.matchAll(/(?:src|href)="\.\.\/|url\(\s*['"]?\.\.\//g))
    hit('R7', f, lineOf(m.index), 'на странице с <base href="../"> «../» лишний');

  if (/^(ds|ds-local)\//.test(f) && !/^\s*\*\s*DS-Origin:/m.test(src))
    hit('R12', f, 1, 'файл ДС без объявленного происхождения');

  if (f.endsWith('.html') && !/<meta name="robots" content="noindex, nofollow">/.test(src))
    hit('R16', f, 1, 'страница без запрета индексации (I8)');

  // R3-R6, R11, R13-R15 — по схеме из таблицы выше.
}

const SPACE = { 4: '--space-1', 8: '--space-2', 12: '--space-3',
                16: '--space-4', 20: '--space-5', 24: '--space-6' };

const targets = REBASE ? allFiles() : changedFiles();
for (const f of targets) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  scanFile(f, src);
  if (!REBASE) for (const [ln, text] of addedLines(f)) {
    if (/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\b(?:white|black)\b/.test(text))
      hit('R9', f, ln, 'литерал цвета — возьми токен из tokens.css');
    const px = /(?:padding|margin|gap)\s*:\s*(\d+)px/.exec(text);
    if (px && SPACE[px[1]]) hit('R10', f, ln, `${px[1]}px → var(${SPACE[px[1]]})`);
    if (/(?:src|href)="https?:\/\//.test(text))
      hit('R15', f, ln, 'внешняя сеть в рантайме (I7)');
  }
}

const html = targets.filter((f) => f.endsWith('.html'));
if (!REBASE && html.length &&
    spawnSync('node', ['scripts/nbsp.mjs', '--check', ...html], { cwd: ROOT }).status === 1)
  hit('R8', html.join(' '), 0,
    `неразрывные пробелы не расставлены: node scripts/nbsp.mjs ${html.join(' ')}`);

const BASELINE = join(ROOT, 'docs/baseline.json');
const byRule = findings.reduce((a, x) => ((a[x.rule] = (a[x.rule] ?? 0) + 1), a), {});

if (REBASE) {
  const prev = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { counts: {} };
  let grown = false;
  for (const [rule, n] of Object.entries(byRule)) {
    const was = prev.counts?.[rule]?.total;
    if (was !== undefined && n > was) {
      console.log(`BASELINE ВЫРОС ${rule}: было ${was}, стало ${n}`); grown = true;
    }
  }
  if (!grown) {
    const counts = Object.fromEntries(Object.entries(byRule)
      .map(([r, n]) => [r, { total: n, note: prev.counts?.[r]?.note ?? '' }]));
    writeFileSync(BASELINE, JSON.stringify(
      { _: prev._, generated: new Date().toISOString().slice(0, 10), counts }, null, 2) + '\n');
    console.log('baseline обновлён:', JSON.stringify(byRule));
  }
  process.exit(grown ? 1 : 0);
}

for (const x of findings) console.log(`FAIL ${x.file}:${x.line} [${x.rule}] ${x.msg}`);
console.log(`\nПроверено файлов: ${targets.length}. Нарушений: ${findings.length}.`);
process.exit(findings.length ? 1 : 0);
```

**Как решают снаружи.** ○ [док] `reviewdog` сделан ровно под это: «запускается только для
диффа, а не для всей кодовой базы», режимы фильтрации `added/modified lines`,
`diff_context`, `file` — [reviewdog](https://github.com/reviewdog/reviewdog).
○ [док] `lint-diff` — то же для ESLint по диапазону коммитов
([lint-diff](https://github.com/grvcoelho/lint-diff)). ○ [инж] Почему команды приходят
к baseline-снимку, а не к смягчению правил:
[Adding New Lint Rules Without the Fuss](https://dev.to/dcwither/adding-new-lint-rules-without-the-fuss-34a2),
[Incrementally linting a codebase](https://ryanbrooks.co.uk/posts/2023-02-17-linting-branch-changes.html).
**Не подходит:** сами инструменты — они внешние бинарники, а наши правила специфичны
(`__slot-back`, `TAB_ALLOW_OUT`, `<base href>`, `DS-Origin`); готового линтера под них
нет. Забираем модель, не инструмент.

---

### Р6. `.github/workflows/macket-check.yml` — I9

Сверено со стилем существующих workflow: `deploy-pages.yml` использует
`actions/checkout@v4` и блок `permissions`; `mirror-sourcecraft.yml` — русские имена
шагов и `concurrency`.

```yaml
name: Проверка макетов

# Гоняется на каждый PR в main. В репозиторий ничего не пишет: только читает и
# печатает отчёт в лог и в сводку прогона — поэтому работает и для PR из форков,
# где токен даётся только на чтение.

on:
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: macket-check-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  check:
    name: macket-check          # ← это имя указывается в required status checks
    runs-on: ubuntu-latest
    steps:
      - name: Забрать код с историей
        uses: actions/checkout@v4
        with:
          fetch-depth: 0        # без этого не посчитать дифф с base-веткой

      - name: Поставить Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'    # как в Dockerfile (node:22-slim)

      - name: Неразрывные пробелы (только проверка)
        run: |
          files=$(git diff --name-only --diff-filter=ACMR \
            "origin/${{ github.base_ref }}...HEAD" -- '*.html')
          if [ -n "$files" ]; then
            node scripts/nbsp.mjs --check $files
          else
            echo "HTML не менялся — пропускаем."
          fi

      - name: Правила сборки макетов
        run: |
          node scripts/lint-macket.mjs --diff "origin/${{ github.base_ref }}" \
            | tee lint.txt
          {
            echo '## Проверка макетов'
            echo '```'
            cat lint.txt
            echo '```'
          } >> "$GITHUB_STEP_SUMMARY"

      - name: Долг не вырос
        run: node scripts/lint-macket.mjs --baseline
```

Три решения с обоснованием: `permissions: contents: read` без комментария в PR — иначе
чек падал бы у авторов из форков не по делу, а отчёт и так виден в сводке прогона;
`fetch-depth: 0` — иначе `git diff origin/main...HEAD` не с чем считать; никакого
`git push` из workflow — под `GITHUB_TOKEN` пуш не перезапускает workflow, и обязательный
чек залипает.

**Дырка:** хватает ли Actions-минут на тарифе репозитория — из сессии проверить нельзя,
**вопрос 7**.

**Как решают снаружи.** ○ [док] GitHub: обязательные проверки не дают смержить PR даже
тем, у кого есть право пуша в защищённую ветку
([about status checks](https://docs.github.com/articles/about-status-checks)); типовые
причины «чек не появился» — имя не совпало или чек не запускался на этом коммите
([troubleshooting](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks)).
○ [инж] Для неразработчиков практикуют `CONTRIBUTING.md`, где заранее описано, какие
проверки ждут
([Writing Practical Contribution Guidelines](https://tenthirtyam.org/dispatches/2026/03/21/writing-practical-contribution-guidelines-for-github-repositories/)).
**Не подходит:** массовая практика «автофиксить и коммитить в ветку PR» — рекурсия и
залипание чека, а для форков невозможно в принципе.

---

### Р7. Разделение точек входа — I3

**Целевые файлы:**

`ds/index.css` — только ДС, ни одного импорта за пределы `ds/`:

```css
@import url('./tokens.css');
@import url('./typography.css');
@import url('./fonts.css');
@import url('./animations.css');
@import url('./components/icon.css');
@import url('./components/button.css');
@import url('./components/button-inline.css');
@import url('./components/uni-cell.css');
@import url('./components/uni-card.css');
@import url('./components/content.css');
@import url('./components/contents-view.css');
@import url('./components/tooltip.css');
```

`ds-local/index.css` — ДС плюс наши расширения:

```css
@import url('../ds/index.css');
@import url('./components/icon-slots.css');   /* карта __slot-* — наша, не апстрим */
@import url('./components/button-ext.css');   /* positive/negative/destructive/ai-gift */
@import url('./components/button-circle.css');
@import url('./components/tag.css');
@import url('./components/promo-banner.css');
@import url('./components/type-scale.css');
```

`app/app.css` — приложение поверх:

```css
@import url('../ds-local/index.css');
@import url('./components/feed-base.css');
/* … остальные продуктовые компоненты … */
:root { --tabbar-height: 49px; }
```

Страница подключает одну строку: `<link rel="stylesheet" href="app.css">`.
`ds/preview.html` подключает `./index.css` — витрина **чистого** ДС, без продуктового.
Это и есть проверка I3: если витрина открылась, границу не нарушили.

Долг D-4 (`tokens.css:100-126` приклеивает `ds-*` к селекторам компонентов) закрывается
здесь же: значения остаются в `ds/tokens.css`, классы `ds-*` переезжают в
`ds/typography.css`, а склейка с селекторами компонентов (`.header.__size-l
.header__subtitle`, `.button-inline.__size-24`, `.text-input.__size-56`) — в файлы
соответствующих компонентов, где ей место.

---

### Р8. Слой публичных адресов — I4

**Проблема, которую он решает архитектурно.** Сегодня адрес прототипа == путь файла на
двух каналах из трёх. Это делает файловую раскладку неприкосновенной и превращает любое
структурное улучшение в поломку чужих ссылок. Правильный ответ — не «не двигать файлы»,
а **отвязать адрес от пути один раз**, после чего перемещения становятся бесплатными.

**Источник истины — `docs/urls.json`:**

```json
{
  "/q3":       "/app/q3-view.html",
  "/activity": "/app/activity-lenta/view.html",
  "/events":   "/app/events-lenta/view.html",
  "/nv":       "/app/new-vision/lenta.html",
  "/preview":  "/ds/preview.html"
}
```

Из него порождаются оба канала:

```js
#!/usr/bin/env node
/**
 * build-redirects.mjs — из docs/urls.json делает статические заглушки для каналов,
 * которые не умеют роутинг (GitHub Pages, SourceCraft Sites).
 * server.mjs читает тот же файл напрямую вместо константы PROTOTYPES.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const map = JSON.parse(readFileSync(join(ROOT, 'docs/urls.json'), 'utf8'));

for (const [pretty, target] of Object.entries(map)) {
  const out = join(ROOT, pretty.replace(/^\//, ''), 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out,
    '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">\n'
    + '<meta name="robots" content="noindex, nofollow">\n'
    + `<meta http-equiv="refresh" content="0; url=..${target}">\n`
    + `<link rel="canonical" href="..${target}">\n`
    + `</head><body><a href="..${target}">${target}</a></body></html>\n`);
  console.log(`${pretty}/ → ${target}`);
}
```

`server.mjs` перестаёт хранить карту в коде и читает тот же `docs/urls.json` — один
источник, три канала, ноль расхождений.

**Следствие, которое надо принять сознательно:** после этого шага старые
путевые адреса (`/lenta-q3.html`, `/activity-lenta/view.html`) продолжают работать до
переезда файлов, а после переезда закрываются такими же заглушками, порождёнными из
того же файла. Поломка ссылок перестаёт быть аргументом против структурных изменений —
она становится строкой в `urls.json`.

---

### Р9. Защита `main` — I9

Settings → Branches (или Rulesets):

| Настройка | Значение | Почему |
|---|---|---|
| Branch name pattern | `main` | с неё публикуются все три канала |
| Require a pull request before merging | ✅ | иначе проверкам негде запускаться |
| └ Required approvals | **0** | ревью здесь не про второго человека, а про то, чтобы прогнать чек |
| Require status checks to pass | ✅ | |
| └ Required check | **`macket-check`** | ровно `jobs.check.name` из Р6; при переименовании job чек молча перестанет быть обязательным |
| └ Require branches up to date | ☐ | при одном авторе даёт лишние ре-раны |
| Require linear history | ☐ | на задачу не влияет |
| Do not allow bypassing the above settings | **☐ — не ставить** | по документации GitHub ограничения по умолчанию не применяются к пользователям с admin-правами; снятая галка оставляет владельцу хотфикс, а всем остальным — обязательный PR |
| Allow force pushes / deletions | ☐ / ☐ | |

Перестанет работать приём «пнуть деплой пустым коммитом прямым push» — следы его в
репозитории есть (`.deploy-trigger` с текстом «redeploy trigger 4»). Замена —
`workflow_dispatch`, он в `deploy-pages.yml` уже объявлен.

**Дырка:** тонкий вариант с bypass-списком для конкретных акторов — **вопрос 7**: по
обсуждению в GitHub Community акторов в bypass-список можно добавлять только когда
репозиторий принадлежит организации, а `github.com/designodn/proto-moon` выглядит личным.
Из сессии не проверяется; вариант в таблице работает и на личном репозитории.

**Как решают снаружи.** ○ [док] GitHub прямо: «по умолчанию ограничения branch protection
не применяются к пользователям с admin-правами», и это отдельная опция
([about protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)).
○ [форум] Про ограничения bypass-списков —
[GitHub Community #43460](https://github.com/orgs/community/discussions/43460); помечаю,
что это обсуждение, а не документация.
**Не подходит:** корпоративное «≥1 обязательный ревьюер» — при одном авторе оно либо
блокирует работу, либо обходится и обесценивает защиту.

---

### Р10. Контракт генератора — I6

Требование к каждому из девяти генераторов, а не пожелание:

1. **`--offline` обязателен.** Реген из уже скачанного JSON, без сети. Сегодня есть у 4
   (`fetch-feed`, `fetch-marathon`, `fetch-profile`, `fetch-q3`) — остальные пять
   дописываются по их образцу.
2. **`--check` обязателен.** Прогон без записи, ненулевой код выхода при расхождении.
3. **Идемпотентность.** Два прогона подряд на одних данных дают побайтово одинаковый
   результат — иначе реген нельзя проверить в CI.
4. **Всё генерируемое — между маркерами.** Ничего не пишется в HTML вне
   `FEED:START`/`FEED:END`.

После этого правило R11 («не править внутри маркеров») становится жёстким без оговорок:
если содержимое между маркерами восстанавливается офлайн одной командой, ручная правка
там — однозначно ошибка, а не вынужденная мера.

---

### Р11. Вопрос ревьюера про дописку в апстрим — I2

**Поправка к постановке:** правила в `.claude/agents/macket-rules-checker.md` **не
пронумерованы** — это маркированный список. Проверено: раздел `## Чек-лист` (строка 70)
содержит буллеты на строках 72, 79, 96, 100, 106, 109, 115, 117; раздел `### Частые
грабли из SESSION-INSIGHTS` (строка 122) — на 124, 126, 131, 136. Поэтому вставка
описывается якорем, а не номером.

**Куда:** в раздел `## Чек-лист`, между буллетом «**Генерируемые блоки.**» (строка 115) и
буллетом «**Интерактив проверен в браузере.**» (строка 117).

**Текст буллета:**

```markdown
- **Дописка в апстримный компонент — спроси и зафиксируй.** Триггер: дифф трогает файл,
  у которого в шапке `DS-Origin: upstream` или `upstream+local` (сводка —
  `docs/ds-manifest.md`). Задай родителю дословно один вопрос:

  > «Файл `<file>` помечен как апстримный (`DS-Origin: <origin>`). Правка в строках
  > `<диапазон>` — наша дописка поверх ДС. Оставляем у нас, отдаём в апстрим или
  > откатываем? Ответь: «в ds-local» / «в апстрим» / «откатить».»

  Принимаются ровно три ответа:
  - **«в ds-local»** → правка должна переехать в `ds-local/components/<имя>-ext.css`,
    а в шапке апстримного файла — остаться пустой `DS-Local-Patch`. Проверь, что переехала.
  - **«в апстрим»** → в отчёт строкой `UPSTREAM-CANDIDATE <file>:<диапазон>`;
    правка остаётся, в `DS-Local-Patch` появляется запись с пометкой «кандидат наверх».
  - **«откатить»** → FAIL, правка не должна попасть в коммит.

  Правка внутри апстримного файла без одного из трёх ответов — **FAIL**: она делает
  будущий апдейт ДС конфликтом (инвариант I2). Файл без шапки `DS-Origin` этим правилом
  не проверяется — его ловит правило R12 линтера.
```

**Как решают снаружи.** ○ [док] `CODEOWNERS` — штатный механизм «этот путь чужой»
([about code owners](https://github.com/github/docs/blob/main/content/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners.md));
○ [инж] опыт эксплуатации и почему поверх понадобились боты
([FullStory](https://www.fullstory.com/blog/taming-github-codeowners-with-bots/));
○ [док] `Danger JS` — бот, комментирующий правила проекта на PR
([danger.systems/js](https://danger.systems/js/)).
**Не подходит:** `CODEOWNERS` требует второго человека — владельца пути; владелец нашего
апстрима сидит в закрытом GitLab и в этот репозиторий не ходит. Плюс для контрибьюторов
извне `CODEOWNERS` ведёт себя не так, как ожидают
([renovate#7927](https://github.com/renovatebot/renovate/issues/7927), ○ [форум]).
`Danger JS` — новая npm-зависимость ради правила, которое всё равно упирается в ответ
человека.

---

### Р12. Сверка с Figma — read-only процедура

Раздел «что измерено»: из 427 уникальных имён `tokens.css` механически сопоставились
**9**; из них **2 разошлись** — `$static-surface-status-accent` (`#ff7700` в Figma против
`#F64A00` в `tokens.css:494`) и типографика `scaled/caption-s` (11/14, `robotoflex`
против `.ds-caption-s` 11/16, OK Sans, `tokens.css:121`). Потолок механической сборки —
**~2%** (11 значений из 509). Ключи к 31 «голой» ноде через MCP невосстановимы: инструмент
отдаёт `libraryKey` вида `lk-…`, а `get_metadata` принимает только `fileKey`
(`^[0-9a-zA-Z]{22,128}$`), и обратного отображения нет.

**Отсюда архитектурный вывод, а не оценка объёма: Figma не может быть источником истины
для `tokens.css`.** Источник — Stylus в закрытом GitLab. Сверка с Figma — это **датчик
расхождения**, и её единственная правильная роль — делать дрейф видимым, а не чинить его.

**Процедура для агента** (кладётся в `.claude/agents/` или разделом в `docs/ds-manifest.md`):

> 1. **Читаешь** `docs/ds-manifest.md`, берёшь строки, где `DS-Source` начинается с
>    `figma:`. Сегодня их три: `tag.css` (`vTg3KAvmAXA9LigeyiqCWL#10248:46639`),
>    `button-circle.css` (`LYZAXE33pUg2cSL5mmUHYq#7306:60106`),
>    `inapp-push.css` (`vTg3KAvmAXA9LigeyiqCWL#20033:120739`).
> 2. **Дёргаешь** `get_variable_defs` с `fileKey` и `nodeId`. Публикующие вызовы
>    (`add_code_connect_map`, `send_code_connect_mappings`, `use_figma`) запрещены.
> 3. **Сравниваешь** имена как есть — они в двух источниках пишутся одинаково. Регистр
>    hex не значим; 8-значный hex в Figma — RGBA против `rgba()` в коде.
> 4. **Формат отчёта** — одна строка на токен:
>    ```
>    DRIFT  --static-surface-status-accent  figma=#ff7700  code=#F64A00  tokens.css:494
>    OK     --dynamic-stroke-contrast-low   figma=#83665614  code=rgba(131,102,86,0.08)
>    ABSENT scaled/caption-s                figma=11/14 robotoflex  code=—
>    ```
>    Итог — три числа: `сверено N, расхождений M, нет в коде K`.
> 5. **Не правишь** `tokens.css` по результатам. Расхождение не значит, что отстал код:
>    Figma и Stylus — два параллельных источника, и какой из них прав, решает не агент.

**Чьё это решение, а не наше.** Связь «компонент в макете == компонент в коде» упирается
в две вещи, которых мы не вправе выдать себе сами: доступ к файлам, где живут остальные
31 нода, и право публиковать Code Connect в корпоративной библиотеке. **Вопрос 8.**

**Как решают снаружи.** ○ [док] Figma опубликовала пример GitHub Action, синхронизирующего
Variables с токенами через Variables REST API
([figma/variables-github-action-example](https://github.com/figma/variables-github-action-example));
сторонний вариант со Style Dictionary
([figma-variables-to-styledictionary](https://github.com/gerard-figma/figma-variables-to-styledictionary)).
○ [форум] Что рассинхрон — норма, а не исключение:
[тред про десинк библиотек](https://forum.figma.com/report-a-problem-6/figma-support-not-responding-design-system-components-keep-desyncing-and-breaking-across-files-46684),
[тред про переставшие синкаться режимы переменных](https://forum.figma.com/report-a-problem-6/figma-modes-variables-stopped-syncing-across-files-it-was-working-fine-but-now-stopped-43353).
○ [док] Code Connect поддерживает HTML/Web Components и framework-agnostic template-файлы
([quickstart](https://developers.figma.com/docs/code-connect/quickstart-guide/)).
**Не подходит:** оба Action-рецепта строятся на **Variables REST API**, а доступный нам
MCP отдаёт переменные только от конкретной ноды и в одном режиме (замерено). И главное —
они принимают Figma за источник истины, чего в нашей схеме нет.

---

### Р13. `docs/structure.md` — готовый текст

Правила записаны в полной силе. Существующие нарушения не смягчают формулировку — они
лежат в `docs/baseline.json` и в реестре долга 2.3.

```markdown
# Где что лежит

Единственный документ про структуру. `CLAUDE.md` на него ссылается и не дублирует.
Колонка «чем проверяется» — где правило живёт на самом деле.

| # | Правило | Чем проверяется |
|---|---|---|
| 1 | **Три корзины по происхождению.** `ds/` — апстрим, не правим. `ds-local/` — наши расширения ДС. `app/` — приложение. Файл кладётся в корзину по своему `DS-Origin`, а не по «примитивности». | линтер R12, R13 |
| 2 | **Точка входа одна и однонаправленная.** `ds/index.css` импортирует только `ds/`; `ds-local/index.css` — `ds/` плюс своё; `app/app.css` — `ds-local/` плюс своё. Страница подключает ровно одну точку входа. Поштучный `<link>` на компонент — нарушение. | линтер R14; долг D-9 |
| 3 | **Апстримный файл не правится.** Расширение — отдельный файл в `ds-local/`, ссылка на него — в `DS-Local-Patch` апстримного файла. | линтер R13, агент |
| 4 | **Происхождение объявлено.** Каждый файл в `ds/` и `ds-local/` несёт шапку `DS-Origin` / `DS-Source` / `DS-Snapshot` / `DS-Local-Patch`. `unknown` допустим, отсутствие — нет. Сводка `docs/ds-manifest.md` генерируется. | линтер R12 |
| 5 | **Прототип — надстройка, не копия.** Новый вариант переиспользует общие экраны и добавляет свой слой стилей (образец — `new-vision/`). Копирование страниц запрещено. Прототип, которому нужна изоляция, объявляет её явно: `<base href="../">` плюс `proto-contain.js`, а выход наружу — только через `TAB_ALLOW_OUT`. | линтер R6; долг D-5, D-10 |
| 6 | **Страница = файл `.html`.** Экраны приложения — в `app/`, отдельный сценарий — в своей папке внутри `app/`. Новых уровней вложенности не заводим. | ревью |
| 7 | **Имена — `kebab-case`, латиница, без пробелов и скобок.** Исключение — `ds/assets/icons/`, где имена приходят из выгрузки ДС. | линтер R5 |
| 8 | **Классы — существующая конвенция:** блок в `kebab-case`, модификаторы `__size-N`, `__style-X`, `__view-X`, `__state-X`, `__slot-X`. Новых схем не вводим. | агент |
| 9 | **JS-компонент — IIFE в `components/*.js`**, подключается `<script src>`. Публичный API — `window.PascalCase`, данные — `window.DS_UPPER_SNAKE`. ESM в браузере не используем. | ревью |
| 10 | **Значения — только из токенов.** Литерал цвета, шага сетки или кегля — нарушение. Существующие учтены в `docs/baseline.json` и могут только убывать. | линтер R9, R10 + baseline |
| 11 | **Генерируемое — только машинное.** Между `FEED:START` и `FEED:END` правит только генератор. Каждый генератор поддерживает `--offline`, `--check` и идемпотентен. | линтер R11; долг D-6 |
| 12 | **Рантайм локален.** Никаких внешних CDN, шрифтов и картинок в разметке. Медиа кладёт `scripts/lib/media-cache.mjs`. | линтер R15 + baseline; долг D-7 |
| 13 | **Ни одной битой локальной ссылки.** Любой `src=`/`href=`/`url()` указывает на существующий файл с точным регистром. | линтер R1 |
| 14 | **Ни одной индексируемой страницы.** `<meta name="robots" content="noindex, nofollow">` в `<head>` каждой страницы, `robots.txt` в корне. | линтер R16 |
| 15 | **Публичный адрес объявлен в `docs/urls.json`.** Путь файла контрактом не является. | ревью |

**Долг.** Правила действуют с первого дня для всего нового. Существующие нарушения
перечислены в `docs/architecture-target.md` §2.3 и посчитаны в `docs/baseline.json`;
их число может только уменьшаться.
```

**Как решают снаружи.** ○ [инж] Ближайшее найденное — практика писать contribution
guidelines так, чтобы структура и требования были понятны до первого PR
([Writing Practical Contribution Guidelines](https://tenthirtyam.org/dispatches/2026/03/21/writing-practical-contribution-guidelines-for-github-repositories/)).
Документов «где что лежит» из дизайн-систем с разбором, что из них реально соблюдается,
**не нашёл**.

---

### Р14. Локальный хук — вспомогательное, не гарантия — I9

Точная строка в существующий блок `scripts` (сейчас там `start`, `sync`, `test`):

```json
  "scripts": {
    "start": "node server.mjs",
    "sync": "node scripts/fetch-all.mjs",
    "test": "node --test scripts/lib/*.test.mjs",
    "prepare": "git config core.hooksPath .githooks || true"
  },
```

**`|| true` обязателен — проверено.** `Dockerfile:22-23` делает `COPY package.json ./` и
`RUN npm install --omit=dev || true`, а `.dockerignore:4` исключает `.git`. То есть
внутри образа `npm install` идёт в каталоге, не являющемся git-репозиторием:

```
$ git config core.hooksPath .githooks    # каталог без .git
fatal: not in a git directory
exit=128
```

Заодно стоит убрать `|| true` из самого `Dockerfile` — он глушит и настоящие сбои
установки.

**Чего этот приём не закрывает — и почему он не заменяет Р6.** Правку через веб-интерфейс
GitHub, коммит из GUI-клиента без node в `PATH`, любого, кто не выполняет `npm i`. Доля
таких случаев — **вопрос 4**. Архитектурно локальный хук — удобство; гарантией по I9
является только проверка на стороне репозитория.

**Как решают снаружи.** ✅ [док] Husky ставит хуки через `prepare` и честно перечисляет,
где это ломается: в CI и Docker хуки отключают через `HUSKY=0`; GUI-клиенты
«запускаются вне терминала и не инициализируют менеджер версий, оставляя `PATH` без пути
к Node» ([how-to](https://typicode.github.io/husky/how-to.html)); первый шаг отладки —
`git config core.hooksPath` ([troubleshoot](https://typicode.github.io/husky/troubleshoot.html)).
○ [инж] Тот же приём без библиотеки — [dev.to/azu](https://dev.to/azu/git-hooks-without-extra-dependencies-like-husky-in-node-js-project-jjp).
**Не подходит:** сам Husky — новая зависимость ради одной строки `git config`.

---

### Р15. Гигиена дерева

Пути проверены, у всех удаляемых 0 входящих ссылок.

```sh
# Папка с пробелом в конце имени — кавычки обязательны.
git rm -r "assets "
git rm feed-content.json comment-as-feed-twitter.html .deploy-trigger .fig2.png

# Пробелы и скобки в имени. Единственное совпадение по имени в репозитории —
# кусок исходного URL Дзена в data/around-you-media.json:155, целевой файл там другой.
git mv "assets/post_crop_small_1080 (2) 1.png" assets/post-crop-small-1080.png
```

`.fig2.png` упомянут в `.dockerignore:13` — строку убрать тем же коммитом:

```diff
--- a/.dockerignore
+++ b/.dockerignore
@@ -10,7 +10,6 @@
 *.md
 *.sh
 .nojekyll
-.fig2.png
 Dockerfile
 .dockerignore
```

`README.md:10-35` описывает четыре несуществующих файла (проверено `ls`), два
существующих не упомянуты:

```diff
--- a/README.md
+++ b/README.md
@@ -27,10 +27,10 @@
     ├── avatar.css              # Avatar (24–56px, image / initials)
     ├── pulse-dot.css           # PulseDot (анимированный индикатор)
-    ├── category-path.css       # CategoryPath (хлебные крошки)
+    ├── breadcrumbs.css         # Breadcrumbs (хлебные крошки)
     ├── feed-base.css           # FeedBase (карточка ленты)
-    ├── feed-tabs.css           # FeedTabs (большие табы сверху)
-    ├── tab-bar.css             # TabBar (нижняя навигация)
-    ├── page-header.css         # StatusBar + NavBar
+    ├── tabs.css                # Tabs (большие табы сверху)
+    ├── tabbar.css              # TabBar (нижняя навигация)
+    ├── header.css              # StatusBar + NavBar
     ├── comment-input.css       # CommentInput (поле + кнопка отправки)
     └── phone-frame.css         # PhoneFrame (375px-viewport для превью)
```

Переименование `.png` — изменение пути, поэтому отдельным коммитом.

---

## 4. План перехода

Порядок продиктован зависимостями между решениями, а не их стоимостью. Всё, что
архитектурно правильно, стоит в плане; ничего не отложено формулировкой «когда
понадобится».

### Волна 0 — немедленно, до всего остального

| Что | Решение | Почему первым |
|---|---|---|
| Запрет индексации на всех каналах | Р1 | вредит прямо сейчас, каждый push переопубликовывает 38 имён и 38 фото |
| Вычистить `SYNC_*`/`GITHUB_TOKEN`/`UPLOADS_*` из `docker-compose.yml` | Р4 | лишние привилегии у процесса, которому они по архитектуре не положены |
| Гигиена дерева и `README.md` | Р15 | дешевле сделать до массовых правок, чем тащить мусор через них |

### Волна 1 — правила начинают действовать

| Что | Решение | Предусловие |
|---|---|---|
| Линтер + `docs/baseline.json` (первый прогон `--baseline`) | Р5 | — |
| Workflow `macket-check` на `pull_request` | Р6 | Р5 |
| Защита `main`, required check `macket-check` | Р9 | Р6 зелёный хотя бы на одном PR |
| `prepare` в `package.json` | Р14 | — |
| `docs/structure.md` | Р13 | Р5 (чтобы колонка «чем проверяется» не врала) |

После этой волны инвариант I9 выполняется: ни одна правка не попадает в `main` мимо
проверок, независимо от того, чем правит автор.

### Волна 2 — граница ДС становится объявленной

| Что | Решение | Предусловие |
|---|---|---|
| Шапки `DS-Origin` в 121 файле | Р2 | ответ на **вопросы 2 и 3** для полей `DS-Snapshot` и классификации |
| Манифест + правила R12/R13 в жёсткий режим | Р3, Р5 | Р2 |
| Буллет в чек-лист агента | Р11 | Р2 |
| Процедура сверки с Figma | Р12 | Р2 |

### Волна 3 — адрес перестаёт быть путём

| Что | Решение | Предусловие |
|---|---|---|
| `docs/urls.json` + генератор заглушек; `server.mjs` читает тот же файл | Р8 | — |
| Разделение точек входа: `ds/index.css` / `ds-local/index.css` / `app/app.css` | Р7 | Р2 (без объявленного происхождения непонятно, что куда) |

Волна 3 — это то, что делает волну 4 обратимой и недорогой. Её нельзя пропустить: без
слоя адресов любое перемещение файлов остаётся ломающим.

### Волна 4 — физическая раскладка

Переезд в `ds/` + `ds-local/` + `app/`. Способ:

1. **Окно заморозки.** 209 открытых веток; после массового `git mv` каждая живая ветка,
   трогающая HTML/CSS, мержится через rename/modify-конфликты. Нужен полный клон (текущий
   shallow — merge-base доступен у 21 из 210), инвентаризация «слить / закрыть / пометить
   as-is» и согласованное окно. **Вопрос 9.**
2. **Два коммита.** Первый — только `git mv` (сохраняет историю). Второй — замены путей.
   Иначе откат неотличим от новых правок.
3. **Точный паттерн для иконок.** `assets/icons/` уезжает в `ds/assets/icons/`, а
   `assets/` остаётся приложением. Замена `assets/` регуляркой по дереву сломает 1477
   путей к медиа; менять можно только точный префикс `assets/icons/` (720 вхождений из
   2197).
4. **Не только HTML/CSS/JS.** `components/` встречается ещё в `data/feed.schema.json`,
   `data/q3-feed.schema.json`, `data/people.json`, `fetch-people.mjs`, `fetch-q3.mjs`,
   `wire-vvz.mjs` и в ~87 местах в `.md` (правила, чек-лист агента, память агентов).
   Пропуск даёт битые пути не в момент правки, а на следующем регене и в следующем
   прогоне ревьюера.
5. **`proto-contain.js` не правится.** Путь монтирования нигде не захардкожен
   (`components/proto-contain.js:20` — `DIR` из `location.pathname`, цели резолвятся через
   `new URL(raw, document.baseURI)`); при переносе приложения целиком файл не требует ни
   одной правки. Это проверено, и на это можно опереться.
6. **Приёмка — линтером, не глазами.** Правило R1 резолвит все локальные пути против
   файловой системы; прогон по одной странице не ловит 404 в редких ветках.
7. **Очистить `/opt/proto-moon` перед первым деплоем.** `.sourcecraft/ci.yaml`
   распаковывает архив поверх (`tar -C /opt/proto-moon`) и ничего не удаляет — иначе
   старое дерево останется отдавать протухший контент и замаскирует поломку.
8. **Заглушки для старых адресов** порождаются из `docs/urls.json` тем же генератором.

### Волна 5 — закрытие долга

| Долг | Что делается |
|---|---|
| D-2 | Дописки `button.css` и карта `__slot-*` переезжают в `ds-local/` |
| D-4 | `ds-*` из `tokens.css` — в `ds/typography.css`, склейка с компонентами — в файлы компонентов |
| D-6 | `--offline` дописывается пяти генераторам (Р10) |
| D-7 | `lottie-web` кладётся локально; `pravatar`/`picsum` заменяются на `assets/people` |
| D-8 | Литералы вычищаются по мере касания файлов; baseline только убывает |
| D-5 | `events-lenta/` сводится с `activity-lenta/` в один прототип с надстройкой |
| D-13 | Ветки разбираются по итогам **вопроса 9** |
| D-14 | Механизм сопровождения правил либо получает расписание, либо перестаёт называться автоматическим |

### Что архитектурно неверно и не делается никогда

Только по архитектурным основаниям:

- **LLM-агент как обязательный status check.** Недетерминированный вердикт в
  блокирующей проверке — это не проверка, а лотерея; воспроизвести отказ нельзя,
  оспорить нечем. Агент остаётся ревьюером с правом задать вопрос человеку (Р11).
- **Автокоммит в `main` с раздающего процесса.** Отменяет I9 целиком: обходит PR, защиту
  ветки и линтер. Если контур загрузки вернут — только через ветку и PR (Р4).
- **Figma как источник истины для `tokens.css`.** Источник — Stylus в GitLab; назначить
  Figma источником значит завести второй и получить неразрешимый конфликт вместо
  видимого расхождения (Р12).
- **Смягчение правила ради легаси.** Нарушает I11. Легаси идёт в baseline.
- **Новый прототип копированием страниц.** Нарушает I5 и воспроизводит D-5.

---

## 5. Вопросы, которые решаем не мы

Каждый вопрос: чьё это решение, варианты и — главное — что в архитектуре меняется от
ответа. Вопросы про «делать или не делать» из прошлой редакции переформулированы в «как
правильно сделать».

**1. Какой уровень доступа должен быть у прототипа с персональными данными?**
*Решение владельца данных.* В репозитории 38 реальных имён и 38 фотографий, публикуется
на трёх каналах.
— (а) Публичный адрес, но не индексируется → Р1 достаточен.
— (б) Доступ по паролю/списку → Pages и SourceCraft Sites отпадают как каналы; остаётся
VM, и `server.mjs` получает слой аутентификации. Это меняет раздел 4: волна 0 включает
отключение двух каналов.
— (в) Данные обезличиваются → пайплайн `fetch-people` меняет контракт, `assets/people`
заменяется на сгенерированные лица. Это самый чистый вариант архитектурно: снимает
вопрос вместе с риском.

**2. Из какой ревизии снят слепок ДС и чем он конвертирован?**
*Решение того, кто снимал; если не восстанавливается — заказчика.*
— (а) Ревизия известна → `DS-Snapshot` заполняется, дифф с апстримом становится
вычислимым, I2 проверяется машинно.
— (б) Неизвестна, конвертер утрачен → `DS-Snapshot: unknown` во всех апстримных файлах,
и это фиксируется как принятое состояние: обновление ДС невозможно до восстановления
доступа (вопрос 10).

**3. Кто может определить происхождение 71 файла без `Source:`?**
*Решение заказчика — назначить человека.* История клона shallow, авторство не
восстанавливается.
— (а) Автор доступен → Р2 выполняется полностью.
— (б) Частично → значение `unknown` штатное; счётчик в манифесте показывает остаток.
— (в) Никого нет → разметка идёт только по машинным признакам (11 файлов с `Source:` +
файлы с Figma-нодой), остальные `unknown` навсегда, и I1 выполняется формально, а I2 —
только для 11 файлов. Это надо принять сознательно.

**4. Как физически работают дизайнеры, которые правят прототип?**
*Наблюдаемый факт, но данных у нас нет.*
— (а) Ветки этого репозитория, git-клиент, node есть → Р14 работает, Р6 применим как есть.
— (б) Форки → комментарий в PR невозможен, отчёт только в сводке прогона (уже так).
— (в) Веб-интерфейс GitHub или GUI без node → Р14 не работает вовсе; вся нагрузка на Р6,
и в `CONTRIBUTING.md` нужен раздел «что делать, когда чек красный».
— (г) Через агентскую веб-сессию → хук включится из `.claude/settings.json`, но `npm i`
может не выполняться; нужны и Р14, и Р6.

**5. Контур загрузки медиа (страница `/content`, S3, автокоммит) — возвращаем?**
*Решение заказчика.* Сегодня он описан в `UPLOADS.md`, заряжен переменными в
`docker-compose.yml:15-31` и отсутствует в `server.mjs`.
— (а) Не возвращаем → Р4 в полном объёме, `UPLOADS.md` удаляется.
— (б) Возвращаем → обязательное условие по I10: сервис создаёт ветку и PR, а не пишет в
`main`; это отдельная задача в волне 5.
— (в) Не решено → Р4 всё равно выполняется (конфигурация не должна врать), а проект
контура помечается статусом.

**6. `.avatar.__size-126` — валидный размер или долг?**
*Решение дизайнера ДС.* Определён в `avatar.css:79` с пометкой `/* legacy */`, но
отсутствует и в шапке файла, и в чек-листе агента.
— (а) Валиден → добавить в шапку `avatar.css`, правило R3 читает файл как есть.
— (б) Долг → убрать из `avatar.css`, заменить употребления, правило начинает его ловить.

**7. Какие права у нас есть на репозиторий и хватает ли тарифа?**
*Административный вопрос.*
— (а) Есть admin → Р9 выполним в описанном виде.
— (б) Организация вместо личного аккаунта → доступен bypass-список для конкретных
акторов, защита становится строже без потери хотфикса.
— (в) Нет admin → I9 недостижим средствами GitHub; надо либо получить права, либо
принять, что проверки носят рекомендательный характер. Второе — отказ от инварианта, и
это должно быть явным решением, а не умолчанием.

**8. Есть ли доступ к остальным Figma-файлам и право публиковать Code Connect?**
*Решение владельца библиотеки.*
— (а) Доступ есть → сверка (Р12) расширяется с 3 компонентов на все, у кого найдётся
ключ; «голые» ноды получают `fileKey`.
— (б) Доступа нет → Р12 остаётся датчиком на трёх компонентах, а правило «новое
упоминание Figma обязано нести полный ключ» становится единственным способом не
ухудшать ситуацию.
— (в) Есть право публиковать Code Connect → появляется машинная связь «нода → файл», и
`DS-Source` можно верифицировать автоматически.

**9. Что делать с 209 открытыми ветками?**
*Решение заказчика; блокирует волну 4.* Содержимое 188 из них проверить нельзя — клон
shallow.
— (а) Закрыть массово → окно заморозки короткое, волна 4 идёт сразу за волной 3.
— (б) Смержить → сначала полный клон и инвентаризация; волна 4 сдвигается.
— (в) Оставить как есть → массовый `git mv` практически исключён, и волна 4 выполняется
по частям, папка за папкой, с более длинным переходным периодом.

**10. Можно ли получить read-доступ к `gitlab.corp.mail.ru/ok/ODKL/odnoklassniki-frontend-common`?**
*Решение организации. Это самый ценный ответ во всём списке.* Сегодня апстрим
недостижим, поэтому «обновить ДС» не имеет технического смысла: не с чем сравнивать.
— (а) Доступ есть → в репозитории заводится `ds/` как зеркало апстрима с зафиксированной
ревизией, `DS-Snapshot` становится настоящим, I2 проверяется диффом, а не честным словом.
Это переводит всю линию с ДС из «наблюдаем расхождение» в «управляем версией».
— (б) Доступа не будет → фиксируем в `README.md` и в манифесте, что ДС — форк без
апстрима, и планируем жить с этим: тогда `ds/` и `ds-local/` перестают быть разными
корзинами по смыслу и остаются разными только по происхождению.
— (в) Доступ возможен при переезде в GitLab → см. вопрос 11.

**11. Насколько реален переезд в GitLab и в каком горизонте?**
*Решение организации.*
— (а) Вероятен → все проверки пишутся Node-скриптами с тонкой обёрткой CI (так и
спроектировано в Р5/Р6): при переезде переписывается ~40 строк YAML, а не логика.
— (б) Маловероятен → можно позволить более плотную интеграцию с GitHub (аннотации,
авто-метки), но выигрыш небольшой.
— (в) Переезд состоится вместе с импортом ДС → волна 4 планируется под него, чтобы
раскладка `ds/`+`ds-local/`+`app/` была готова к моменту импорта, а не переделывалась
после.

---

## 6. Как это проверялось

**Что сделано в этой сессии.** Все замеры повторены на рабочем дереве коммита `5436c38`.
Проверялось **по коду**, а не по документации: `README.md`, `UPLOADS.md`, комментарии в
`docker-compose.yml` и в агентских файлах рассматривались как заявления, требующие
подтверждения.

**Проверено лично в этой сессии и вошло в документ:**
`server.mjs` — 163 строки, `X-Robots-Tag` на строке 100, роут `/robots.txt` на 103, ни
`/content`, ни `upload`, ни S3, ни git; отсутствие файла `robots.txt` и `<meta
name="robots">` (0 вхождений); `assets/people` — 38 файлов, 4 МБ; `data/people.json` — 38
имён; `docker-compose.yml:15-31`; `scripts/lib/bucket.mjs` импортируется только из
`check-bucket.mjs`, `migrate-assets.mjs`, `migrate-clips.mjs`; `index.css` — 73 `@import`,
из них 15 продуктовых; `tokens.css:100-126` — склейка `ds-*` с селекторами компонентов;
`avatar.css:79` — `__size-126 /* legacy */`; отсутствие `schedule`/`cron` в
`.github/workflows/` и `.sourcecraft/`; `new-vision/` и `koleso/` — 0 тегов `<base href>`
и 0 подключений `proto-contain.js`; 5 страниц без общей точки входа; структура чек-листа
`macket-rules-checker.md` (маркированный список, буллеты на строках 72-136);
`git config core.hooksPath` вне репозитория → `fatal: not in a git directory`, exit 128;
`Dockerfile:22-23` + `.dockerignore:4`; `.dockerignore:13` = `.fig2.png`;
`data/around-you-media.json:155` — URL Дзена, целевой файл другой, переименование
безопасно; 209 открытых веток при 210 ссылках, merge-base доступен у 21.

**Взято из предыдущей редакции без перепроверки** — эти числа сверял независимый
верификатор другим методом (`git grep -o` по трекаемым файлам против `grep -roI` по
дереву): 488 ссылок на `components/` (575 по репозиторию, 87 в `.md`); 2197 на `assets/`
(html 1512, json 402, mjs 111, js 90, css 82), из них 720 — `assets/icons/`; 692 внутри
`FEED`-блоков; 17 на `tokens.css`; 8 реальных тегов `<base href>`; 4 страницы с
`proto-contain.js`; 82 CSS + 35 JS; 975 иконок; 509 объявлений при 427 именах; 46 страниц
(47 `.html`, один партиал), 29 в корне, 36 из 46 с `index.css`; 11 из 82 CSS с `Source:`;
121 файл под провенанс; 426 литералов цвета и 135 `rgba(` в HTML, 138 в
`components/*.css`, 616 инлайн-`style=`, `<style>` на 45 из 46; расхождение форков
974/544/14/20; `--offline` у 4 генераторов из 9; Figma — 9 сопоставимых имён, 2
расхождения, потолок ~2%, 34 уникальных nodeId в 36 файлах, ключи невосстановимы через MCP.

**Ограничения замеров, которые надо знать.** Клон **shallow** (`.git/shallow`, 51 коммит,
2026-07-09…08-02) — поэтому аргументы «из истории правок файла» не используются нигде, а
содержимое 188 веток из 209 непроверяемо. Раздел про Figma опирается на read-only вызовы
MCP, выполненные в предыдущей сессии другим агентом; я их не повторял.

**Осталось непроверенным** — помечено по месту в тексте:
доступность Figma Variables REST API и прав на публикацию Code Connect (вопрос 8);
права на репозиторий и лимиты Actions (вопрос 7); поведение workflow на PR из форков
именно в этом репозитории; доля ложных срабатываний правила R1 до первого прогона;
`fileKey` для 31 «голой» ноды; что именно трогают 188 веток; заявление
`.sourcecraft/sites.yaml` о публикации корня — в самом YAML есть только `ref: "main"`,
вывод про корень взят из комментария в файле.

**Что в репозитории изменено этой работой:** создан только этот файл. Ничего не удалялось,
не переименовывалось и не коммитилось.

---

## Приложение А. Откуда это выросло

Первым заходом был разбор раздела «10. Сцепление и цена реорганизации» из
`docs/architecture.md` — там впервые посчитали, чем слои сцеплены, и предложили две
корзины `ds/` + `app/`. Разбор был построен как ответ на чужой текст и потому наследовал
его логику: решения оценивались стоимостью перехода, а «дорого» и «сломает ссылки»
работали как аргументы против. Настоящий документ переписан от целевого состояния;
цена перехода осталась там, где ей место, — в разделе 4, где она определяет порядок и
способ, а не в вердиктах.

Что изменилось по существу против того разбора: `app/` перестал быть «вопросом вкуса» и
встал в план (волна 4); физический перенос перестал быть «по триггеру» и получил
порядковый номер; правила перестали смягчаться ради легаси — вместо этого появился
baseline (I11); появились слой публичных адресов (I4), контракт генератора (I6), запрет
внешних сетей (I7) и запрет индексации (I8), которых там не было вовсе.

## Приложение Б. Сводка замеров

| Что | Значение |
|---|---|
| HTML-страниц | 46 (47 `.html`, один — партиал), 29 в корне |
| Подключают `index.css` | 36 из 46 |
| `components/` | 82 CSS + 35 JS + 1 партиал |
| Файлов ДС под провенанс | 121 (82 + 35 + 4 корневых CSS) |
| С объявленным `Source:` | 11 (8 апстрим, 3 Figma) |
| `index.css` | 73 `@import`, из них 15 продуктовых |
| `tokens.css` | 509 объявлений, 427 уникальных имён |
| Иконок | 975 |
| Ссылок на `components/` | 488 в 109 файлах (575 по репозиторию, 87 в `.md`) |
| Ссылок на `assets/` | 2197 в 111 файлах; 720 — `assets/icons/`; 692 в `FEED`-блоках |
| Ссылок на `tokens.css` | 17 |
| Тегов `<base href="../">` | 8 |
| Страниц с `proto-contain.js` | 4 |
| Генераторов | 9 + оркестратор; `--offline` у 4 |
| Литералы цвета | 426 hex + 135 `rgba(` в HTML; 138 hex в `components/*.css` |
| Инлайн-`style=` / `<style>` | 616 / на 45 страницах из 46 |
| Внешние сети в HTML | jsdelivr на 11 страницах; `googleapis` 76, `pravatar` 79, `picsum` 15, `okcdn` 38 |
| Каналов публикации | 3 (GitHub Pages, SourceCraft Sites, VM) |
| Персональные данные | 38 имён в `data/people.json`, 38 фото в `assets/people` (4 МБ) |
| Открытых веток | 209 (merge-base доступен у 21) |
| Figma | 9 сопоставимых имён, 2 расхождения, потолок автосборки ~2%, 34 nodeId в 36 файлах, 3 с полным ключом |
