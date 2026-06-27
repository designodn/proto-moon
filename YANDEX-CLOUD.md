# Хостинг прототипа на Yandex Compute Cloud (VM) + автодеплой через SourceCraft

Прототип раздаёт Node-сервер `server.mjs`: отдаёт статику и сам пересобирает
ленту из Google-таблицы (`scripts/fetch-all.mjs`) при старте и **по кнопке
«Обновить ленту»** на лендинге. Он крутится в Docker-контейнере на постоянной
виртуалке (VM) Yandex Compute Cloud — прямой аналог Railway: машина всегда
включена, поэтому синк и кнопка работают стабильно.

Автодеплой: **push в `main` → SourceCraft CI заходит на VM по SSH и
пересобирает контейнер** (`docker compose up -d --build`). Менять что-то руками
для обычного обновления не нужно — просто мерджи в `main`.

> История: сначала пробовали Serverless Containers (эфемерные, деплой через
> `yc`), но из-за их «засыпания» лента обновлялась нестабильно. Переехали на
> постоянную VM — см. раздел «Почему VM» ниже. Старый serverless-контейнер удалён.

В репозитории для этого лежат:
- `Dockerfile` — образ на `node:22-slim`, запускает `server.mjs`;
- `.dockerignore` — выкидывает из образа `.git`, доки, скрипты;
- `docker-compose.yml` — сервис `web` (порт 80→8080, `SYNC_ON_START=true`);
- `.sourcecraft/ci.yaml` — SSH-деплой на VM при push в `main`.

---

## Как это работает (схема)

```
push / merge в main (GitHub)
   → .github/workflows/mirror-sourcecraft.yml зеркалит репо в SourceCraft
   → SourceCraft CI, workflow `deploy` (.sourcecraft/ci.yaml)
   → по SSH: tar кода в /opt/proto-moon на VM, затем docker compose up -d --build

запрос пользователя:
   proto-design-okds.ru
   → Cloud DNS (зона okds-zone, ANAME на шлюз)
   → API Gateway okds-gw (HTTPS, Let's Encrypt; http-интеграция → VM:80)
   → VM ok-ds-vm (89.169.132.5), контейнер server.mjs на :80
```

**Почему VM, а не Serverless:** `server.mjs` пишет файлы в рантайме (синк ленты)
и держит дочерние процессы. На serverless инстансы эфемерны и засыпают —
синканутые данные терялись, лента «не обновлялась». Постоянная VM ведёт себя как
Railway: один всегда живой процесс, состояние сохраняется, кнопка синка работает.

---

## Текущий боевой деплой (что реально поднято)

Каталог `default` (folder `b1g072enfcmkigbqem47`, cloud `b1gnhmibe8oinctgao9v`).

| Ресурс | Имя | ID / адрес |
|---|---|---|
| Compute VM | `ok-ds-vm` | `fhm4fsj5ia9nbh9th9p6`, IP `89.169.132.5`, зона `ru-central1-a` |
| API Gateway | `okds-gw` | `d5dpkskhhsasgbkcguu1` |
| DNS-зона | `okds-zone` | `dnsckb5gb22r8sh1emn9` |
| Сертификат (Let's Encrypt) | `okds-cert` | `fpq4v4m5bgdn432b6n0e` |
| Сервисный аккаунт (robot) | `ok-ds-deployer` | `ajelabfql2u109qc1p0j` |

**Адреса:**
- основной (красивый): <https://proto-design-okds.ru/>
- технический шлюз: `https://d5dpkskhhsasgbkcguu1.kr8f6hld.apigw.yandexcloud.net/`
- VM напрямую (http, для отладки): `http://89.169.132.5/`

**Приватность:** `server.mjs` отдаёт `X-Robots-Tag: noindex` и `robots.txt` с
полным `Disallow` — из поиска не находится, доступ только по ссылке.

**Пути:** `/` — разводящая с кнопкой «Обновить ленту»; `/q3`, `/activity`,
`/nv`, `/preview` — прототипы; `/healthz` — статус синка; `POST /api/sync` —
ручной синк (его дёргает кнопка).

> Условие: Google-таблица открыта «всем, у кого есть ссылка», иначе gviz-CSV не
> отдаст данные и синк упадёт (сайт при этом продолжит раздаваться).

---

## Обновление прототипа

### Обычный путь — просто мерж в `main`
Любой push/merge в `main` автоматически выкатывается на VM (SourceCraft CI →
SSH → `docker compose up -d --build`). Ничего вручную делать не надо.

Секрет, который это питает (задан в SourceCraft, репозиторий `proto-moon-mirror`,
**Settings → Secrets**):
- `DEPLOY_SSH_KEY` — приватный SSH-ключ для входа на VM, в base64.

### Обновить только ленту (без кода)
- на сайте нажми кнопку **«Обновить ленту из таблицы»** (дёргает `POST /api/sync`),
  либо
- передеплой (мерж в `main`) — при старте контейнера синк прогоняется заново.

### Авто-коммит результата синка (env)
После успешного синка `server.mjs` коммитит изменённые данные/страницы/медиа и
пушит их в `main` — так свежее переживает пере-деплой (CI заливает на VM
содержимое `main`). Инфраструктура для этого уже готова: CI довозит на VM `.git`,
а образ (Dockerfile) содержит `git`. Осталось дать токен — **один раз**:

```bash
# на VM (ssh yc-user@89.169.132.5), рядом с docker-compose.yml:
cd /opt/proto-moon
printf 'GITHUB_TOKEN=ghp_xxx\n' > .env     # или SYNC_GIT_PUSH_URL=… для Sourcecraft
docker compose up -d                        # подхватит .env
```
`.env` лежит только на VM и **не коммитится** (docker compose читает его сам для
подстановки `${…}` в `docker-compose.yml`). Без токена/URL коммит сделается, а
пуш — нет (в статусе кнопки «пуш не прошёл»).

Переменные (в `docker-compose.yml` уже проброшены, значения — из `.env`/окружения):
- `GITHUB_TOKEN` — токен с правом записи (нужен для пуша на GitHub);
- `SYNC_GIT_PUSH_URL` — готовый remote с авторизацией для **не-GitHub** хоста
  (Sourcecraft), напр. `https://<TOKEN>@git.sourcecraft.dev/<org>/<repo>.git`;
  приоритетнее `GITHUB_TOKEN`;
- `SYNC_GIT_BRANCH` — ветка пуша (по умолчанию — текущая ветка контейнера);
- `SYNC_GIT_COMMIT=false` — выключить авто-коммит совсем;
- `SYNC_GIT_NAME` / `SYNC_GIT_EMAIL` — автор коммита;
- `GIT_REPO_SLUG` — `owner/repo` (по умолчанию `designodn/proto-moon`);
- `SYNC_ON_START=false` — не синкать при старте контейнера (только по кнопке).

⚠️ Пуш в `main` снова запустит деплой (push → CI → выкат на VM). Обычно это и
нужно (свежие данные доедут до VM штатным путём), но если авто-редеплой от синка
нежелателен — пушь в отдельную ветку через `SYNC_GIT_BRANCH`. В историю при этом
попадают webp-бинарники — коммиты от синка «тяжёлые».

---

## Ручные операции на VM (нужен SSH)

Заходить на VM нужно приватным деплой-ключом (тем, что лежит в секрете
`DEPLOY_SSH_KEY`, в декодированном виде):
```bash
ssh -i <путь_к_приватному_ключу> yc-user@89.169.132.5

# на VM код лежит в /opt/proto-moon:
cd /opt/proto-moon
docker compose ps             # статус контейнера
docker compose logs -f web    # логи сервера (синк, ошибки)
docker compose restart web    # перезапуск
docker compose up -d --build  # пересборка вручную
```

### Если нужно пересоздать VM с нуля
Машина поднималась с cloud-init, который ставит Docker и заводит пользователя
`yc-user` с публичным деплой-ключом, и создаёт `/opt/proto-moon`. Образ —
`ubuntu-2204-lts`, тип `2 vCPU (core_fraction 20) / 2 GB`.

---

## Домен и HTTPS

Домен `proto-design-okds.ru` делегирован в Yandex Cloud DNS (NS
`ns1/ns2.yandexcloud.net`). В зоне `okds-zone`:
- `ANAME @ → d5dpkskhhsasgbkcguu1.kr8f6hld.apigw.yandexcloud.net` (шлюз);
- `_acme-challenge … CNAME` — подтверждение сертификата.

HTTPS — managed-сертификат Let's Encrypt (`okds-cert`) в Certificate Manager,
привязан к домену на API Gateway. Шлюз проксирует на VM по HTTP
(`type: http`, `url: http://89.169.132.5/{proxy}`).

### Полезные команды
```bash
yc compute instance get --name ok-ds-vm
yc serverless api-gateway get --name okds-gw
yc dns zone list-records --name okds-zone
yc certificate-manager certificate get --id fpq4v4m5bgdn432b6n0e
```

---

## Робот (сервисный аккаунт) и ключи

Инфраструктуру (VM, шлюз, DNS-зону, сертификат) поднимали от имени технического
**сервисного аккаунта** (робота), а не живого человека.

| Параметр | Значение |
|---|---|
| Имя | `ok-ds-deployer` |
| ID | `ajelabfql2u109qc1p0j` |
| Роль | `admin` на каталог `default` |
| Ключ | авторизованный ключ (RSA) `authorized_key.json` — для `yc` |

Важно: для **автодеплоя** этот SA-ключ не нужен — деплой ходит на VM по
отдельному **SSH-ключу** (секрет `DEPLOY_SSH_KEY` в SourceCraft). SA-ключ нужен
только для управления облаком через `yc` (создать/изменить ресурсы).

Оба ключа — секреты, в git их не коммитим.

### Управление ключами
```bash
# SA-ключи (yc)
yc iam key list --service-account-name ok-ds-deployer
yc iam key delete --id <KEY_ID>
yc iam key create --service-account-name ok-ds-deployer --output new-key.json

# понизить роль робота обратно до editor (если облако больше не меняем)
yc resource-manager folder remove-access-binding b1g072enfcmkigbqem47 \
  --role admin --subject serviceAccount:ajelabfql2u109qc1p0j
```

> SA-ключ можно удалить, если управление облаком через `yc` больше не нужно —
> сайт и автодеплой от этого не остановятся (они на SSH-ключе). Для будущих
> правок инфраструктуры ключ придётся выпустить заново.

---

## Чек-лист (выполнено)
- [x] VM `ok-ds-vm` создана (Docker через cloud-init)
- [x] `docker-compose.yml` + `.sourcecraft/ci.yaml` (SSH-деплой) в репозитории
- [x] Секрет `DEPLOY_SSH_KEY` добавлен в SourceCraft (`proto-moon-mirror`)
- [x] Автодеплой при push в `main` работает
- [x] Домен `proto-design-okds.ru` + HTTPS через API Gateway → VM
- [x] Приватность: `noindex` + `robots.txt`
- [x] Старый serverless-контейнер удалён
- [ ] Railway отключён
