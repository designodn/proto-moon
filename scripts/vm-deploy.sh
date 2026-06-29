#!/bin/sh
# Пересборка и пересоздание контейнера прототипа на VM.
#
# Запускается по ssh ПОСЛЕ распаковки свежего кода в /opt/proto-moon
# (см. .sourcecraft/ci.yaml, шаг «АТОМАРНЫЙ ДЕПЛОЙ»). Вынесено в ОТДЕЛЬНЫЙ файл
# намеренно: раннер SourceCraft (busybox sh) спотыкается на встроенных в YAML
# многострочных ssh-командах с «#»-комментами и кавычками — так подряд падали
# деплои #670/#671 («syntax error: unterminated quoted string»), и шаг build+up
# просто не исполнялся → контейнер крутил старый образ. Обычный .sh-файл такой
# боли лишён: busybox исполняет его как файл, без хрупкого встраивания в YAML.
#
# Логика: build (старый контейнер ещё жив → без простоя при ошибке сборки) →
# снос старого → up --force-recreate → проверка healthz. Честный код выхода:
# !=0 только на реальной ошибке build/up.
cd /opt/proto-moon || { echo "FATAL: no /opt/proto-moon dir"; exit 9; }

echo "PS_BEFORE:"; docker ps -a --format "{{.Names}} | {{.Image}} | {{.Status}}"

# 1) Собрать образ. Старый контейнер ещё обслуживает порт 80 — если сборка
#    упадёт, прод не трогаем и видим причину в хвосте build-лога.
docker compose build > /tmp/build.log 2>&1; b=$?
echo "BUILD_EXIT=$b"; tail -25 /tmp/build.log
if [ "$b" -ne 0 ]; then
  echo "BUILD_FAILED keep-old-container"
  exit "$b"
fi

# 2) Снести старое: compose-контейнеры/orphans + ЛЮБОЙ контейнер, держащий порт 80
#    (вдруг запущен вне compose / из старого проекта).
docker compose down --remove-orphans 2>&1 | tail -4
docker ps -aq --filter "publish=80" | xargs -r docker rm -f 2>&1 || true

# 3) Поднять заново из свежего образа.
docker compose up -d --force-recreate > /tmp/up.log 2>&1; u=$?
echo "UP_EXIT=$u"; cat /tmp/up.log
echo "PS_AFTER:"; docker ps -a --format "{{.Names}} | {{.Image}} | {{.Status}}"
docker image prune -f >/dev/null 2>&1 || true

# 4) Что РЕАЛЬНО отдаётся теперь (JSON печатаем как есть, не парсим). Признак
#    успеха: build уже не старый, а lastSync.reason=startup — значит контейнер
#    физически пересоздан новым кодом (server.mjs зовёт runSync('startup') при старте).
sleep 2
echo -n "SERVED_AFTER="
curl -s -m 5 localhost/healthz | head -c 220
echo
exit "$u"
