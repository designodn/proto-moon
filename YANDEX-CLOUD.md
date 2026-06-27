# Переезд с Railway → Yandex Serverless Containers

Прототип раздаёт Node-сервер `server.mjs`: он отдаёт статику и сам пересобирает
ленту из Google-таблицы (`scripts/fetch-all.mjs`) при старте и **по кнопке
«Обновить ленту»** на лендинге. Чтобы сохранить ровно это поведение (включая
живую кнопку), на стороне Yandex Cloud берём **Serverless Containers** — это
прямой аналог Railway: тот же контейнер, тот же `npm start`.

> Если живая кнопка не нужна, а лента может обновляться только при пуше/по
> расписанию — проще и дешевле статика в Object Storage (см. `DEPLOY.md`) или
> SourceCraft Sites + CI (см. `.sourcecraft/`). Здесь — путь «как на Railway».

В репозитории для этого уже лежат:
- `Dockerfile` — образ на `node:22-slim`, запускает `server.mjs`;
- `.dockerignore` — выкидывает из образа `.git`, доки, скрипты деплоя;
- `deploy-yandex-container.sh` — собирает образ, пушит в реестр и выкатывает ревизию.

---

## Почему Serverless Containers, а не Cloud Functions

Функции рассчитаны на короткий обработчик, а тут — обычный HTTP-сервер с
дочерними процессами синка. Контейнер запускает наш образ как есть и сам
прокидывает в него переменную `PORT` (её `server.mjs` уже читает) — менять код
не нужно.

---

## Часть 1. Разовая подготовка (руками, автоматизировать нельзя)

Это нужно сделать один раз. Дальше каждый деплой — одна команда.

### 1.1. Аккаунт и каталог
1. Зайдите в <https://console.yandex.cloud>, создайте облако и каталог (folder),
   привяжите платёжный аккаунт. Для такой нагрузки — копейки в месяц
   (контейнер тарифицируется по времени обработки запросов).

### 1.2. CLI
```bash
# Установка: https://yandex.cloud/docs/cli/quickstart
yc init                 # залогиниться, выбрать облако, каталог и зону
```

### 1.3. Container Registry (где лежит образ)
```bash
yc container registry create --name ok-ds
yc container registry list      # запомните ID реестра вида crp********
yc container registry configure-docker   # научить docker пушить в cr.yandex
```

### 1.4. Сервисный аккаунт для контейнера
Контейнеру нужен аккаунт, под которым он тянет образ из реестра.
```bash
yc iam service-account create --name ok-ds-runner
yc iam service-account list     # запомните ID аккаунта вида aje********
```
Выдайте ему права на каталог (CONTAINER_REGISTRY → каталог):
```bash
# FOLDER_ID берётся из `yc config get folder-id`
yc resource-manager folder add-access-binding <FOLDER_ID> \
  --role container-registry.images.puller \
  --subject serviceAccount:<SERVICE_ACCOUNT_ID>
yc resource-manager folder add-access-binding <FOLDER_ID> \
  --role serverless-containers.admin \
  --subject serviceAccount:<SERVICE_ACCOUNT_ID>
```

---

## Часть 2. Деплой (повторяемый)

```bash
export REGISTRY_ID=crp********            # из шага 1.3
export SERVICE_ACCOUNT_ID=aje********     # из шага 1.4
./deploy-yandex-container.sh
```

Скрипт: соберёт образ → запушит в реестр → создаст контейнер `ok-ds-proto`
(если его ещё нет) → выкатит новую ревизию.

После **первого** деплоя один раз откройте контейнер наружу без авторизации:
```bash
yc serverless container allow-unauthenticated-invoke --name ok-ds-proto
```

Адрес прототипа (вида `https://bba********.containers.yandexcloud.net/`):
```bash
yc serverless container get --name ok-ds-proto
```

Дальше всё как на Railway:
- `/` — разводящая с кнопкой «Обновить ленту из таблицы»;
- `/q3`, `/activity`, `/nv`, `/preview` — прототипы;
- `/healthz` — статус сервера и последнего синка;
- `POST /api/sync` — ручной запуск синка (его дёргает кнопка).

> Условие, как и на Railway: Google-таблица открыта «всем, у кого есть ссылка»,
> иначе gviz-CSV не отдаст данные и синк упадёт (сайт при этом раздаётся).

### Переменные окружения деплоя (необязательные)
| Переменная           | Дефолт        | Зачем |
|----------------------|---------------|-------|
| `CONTAINER_NAME`     | `ok-ds-proto` | имя контейнера |
| `IMAGE_TAG`          | `latest`      | тег образа |
| `CORES` / `MEMORY`   | `1` / `1GB`   | ресурсы инстанса |
| `CONCURRENCY`        | `4`           | запросов на инстанс |
| `EXEC_TIMEOUT`       | `600s`        | таймаут запроса (синк бывает долгим) |
| `SYNC_ON_START`      | `true`        | синкать ленту при старте (как на Railway) |

---

## Важно про Serverless Containers (отличия от Railway)

Railway держит один контейнер всегда живым, поэтому синканутые в него файлы
живут до редеплоя. У Serverless Containers инстансы **эфемерны и могут
масштабироваться/засыпать**:

- Синк (`fetch-all.mjs`) перезаписывает файлы **внутри конкретного тёплого
  инстанса**. Запросы к тому же инстансу увидят свежую ленту; новый/холодный
  инстанс отдаст ленту, **запечённую в образ** на момент сборки.
- Кнопка работает: `server.mjs` запускает синк фоном и сразу отдаёт `202`, а
  браузер каждые 2с опрашивает `/healthz` — эти запросы не дают инстансу
  заснуть, пока синк идёт.
- Чтобы лента в образе изначально была свежей, прогоняйте `npm run sync` локально
  перед деплоем (или выкатывайте после пуша в main, когда лента уже пересобрана).
- Хотите, чтобы синканутое состояние жило стабильно и не было холодных стартов —
  включите провиженинг 1 инстанса (`--min-instances 1` при деплое ревизии);
  это держит инстанс тёплым, но тарифицируется постоянно.

Для прототипа «показать завтра» дефолтов достаточно.

---

## Часть 3. Отключение Railway

Когда новый адрес проверен и всё открывается:
1. В Railway-проекте: **Settings → Danger → Delete Service / Delete Project**
   (или просто отключите автодеплой из GitHub, если хотите оставить как запас).
2. `RAILWAY.md` оставлен в репозитории как справка — он больше не основной путь.

---

## Чек-лист «переехать»
- [x] `yc init` сделан, каталог выбран
- [x] Container Registry создан, `configure-docker` выполнен (есть `REGISTRY_ID`)
- [x] Сервисный аккаунт создан, роли выданы (есть `SERVICE_ACCOUNT_ID`)
- [x] `./deploy-yandex-container.sh` отработал, ревизия активна
- [x] `allow-unauthenticated-invoke` включён
- [x] Прототип открывается по `*.containers.yandexcloud.net`, кнопка синка работает
- [ ] Railway отключён

---

## Текущий боевой деплой (что реально поднято)

Каталог `default` (folder `b1g072enfcmkigbqem47`, cloud `b1gnhmibe8oinctgao9v`).

| Ресурс | Имя | ID |
|---|---|---|
| Container Registry | `ok-ds` | `crp00hn2b224r9p3r4c9` |
| Serverless Container | `ok-ds-proto` | `bbasbrdpofr31h0nen4l` |
| API Gateway | `okds-gw` | `d5dpkskhhsasgbkcguu1` |
| DNS-зона | `okds-zone` | `dnsckb5gb22r8sh1emn9` |
| Сертификат (Let's Encrypt) | `okds-cert` | `fpq4v4m5bgdn432b6n0e` |
| Сервисный аккаунт | `ok-ds-deployer` | `ajelabfql2u109qc1p0j` |

**Адреса:**
- основной (красивый): <https://proto-design-okds.ru/>
- технический контейнер: `https://bbasbrdpofr31h0nen4l.containers.yandexcloud.net/`
- технический шлюз: `https://d5dpkskhhsasgbkcguu1.kr8f6hld.apigw.yandexcloud.net/`

**Приватность:** контейнер отдаёт `X-Robots-Tag: noindex` и `robots.txt` с полным
`Disallow` — из поиска не находится, доступ только по ссылке.

### Как привязан домен (схема)
Домен делегирован в Yandex Cloud DNS (NS `ns1/ns2.yandexcloud.net`). Запросы:
`proto-design-okds.ru` → (ANAME в зоне) → API Gateway `okds-gw` → Serverless
Container `ok-ds-proto`. HTTPS — managed-сертификат Let's Encrypt из Certificate
Manager, привязан к домену шлюза.

### Обновить прототип (передеплой)
```bash
yc config profile activate ok-ds            # профиль с ключом ok-ds-deployer
# (по желанию свежие данные в образ:) npm run sync
yc iam create-token | docker login --username iam --password-stdin cr.yandex
IMAGE=cr.yandex/crp00hn2b224r9p3r4c9/ok-ds-proto:latest
docker build -t "$IMAGE" . && docker push "$IMAGE"
yc serverless container revision deploy \
  --container-name ok-ds-proto --image "$IMAGE" \
  --cores 1 --memory 1GB --concurrency 4 --execution-timeout 600s \
  --environment SYNC_ON_START=true \
  --service-account-id ajelabfql2u109qc1p0j
```

### Полезные команды
```bash
# адрес и статус контейнера
yc serverless container get --name ok-ds-proto
# домены шлюза / записи зоны / статус сертификата
yc serverless api-gateway get --name okds-gw
yc dns zone list-records --name okds-zone
yc certificate-manager certificate get --id fpq4v4m5bgdn432b6n0e
```

---

## Робот (сервисный аккаунт) и ключ доступа

Весь деплой делается от имени технического пользователя — **сервисного
аккаунта** (он же «робот»), а не от живого человека. Это безопаснее и позволяет
автоматизировать выкат.

| Параметр | Значение |
|---|---|
| Имя | `ok-ds-deployer` |
| ID | `ajelabfql2u109qc1p0j` |
| Роль | `admin` на каталог `default` |
| Ключ | авторизованный ключ (RSA), скачан как `authorized_key.json` |

Этот же аккаунт назначен **рантайм-аккаунтом контейнера** (`--service-account-id`)
— под ним контейнер тянет образ из Container Registry.

### Зачем нужна роль `admin`
Сначала роли `editor` хватало для всего, кроме одного: открыть контейнер всему
интернету (`allUsers`) и привязать публичный домен может только `admin` — это
защита Yandex от случайной публикации. Поэтому роль повышена до `admin`.

### Ключ — это секрет
Авторизованный ключ (`authorized_key.json`) даёт полный доступ к каталогу.
Его нельзя коммитить в git и выкладывать. Если он утёк — удалите ключ (команды
ниже), доступ по нему сразу пропадёт.

### Управление ключом и аккаунтом
```bash
# посмотреть ключи аккаунта
yc iam key list --service-account-name ok-ds-deployer
# удалить ключ (доступ по нему мгновенно закроется)
yc iam key delete --id <KEY_ID>
# выпустить новый ключ (если нужен для будущих деплоев)
yc iam key create --service-account-name ok-ds-deployer --output new-key.json
# понизить роль обратно до editor (если публичный доступ больше не меняем)
yc resource-manager folder remove-access-binding b1g072enfcmkigbqem47 \
  --role admin --subject serviceAccount:ajelabfql2u109qc1p0j
```

> Если деплои больше не планируются — ключ можно удалить, контейнер от этого не
> остановится (ключ нужен только для сборки/выката, а не для работы сайта).
