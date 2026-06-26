#!/usr/bin/env bash
#
# deploy-yandex-container.sh — собирает Docker-образ прототипа и выкатывает его
# в Yandex Serverless Containers (полный аналог Railway: тот же server.mjs с
# живой кнопкой «Обновить ленту»).
#
# Что нужно сделать руками ОДИН раз перед первым запуском (это в консоли/CLI,
# автоматизировать нельзя) — подробно в YANDEX-CLOUD.md:
#   1. Зарегистрироваться в Yandex Cloud, создать облако + каталог, привязать
#      платёжку.
#   2. Поставить и залогинить CLI:  yc init   (выбрать каталог и зону).
#   3. Создать Container Registry:   yc container registry create --name ok-ds
#   4. Создать сервисный аккаунт с ролями serverless-containers.admin и
#      container-registry.images.puller (или editor на каталог) — его id
#      кладём в SERVICE_ACCOUNT_ID.
#   5. Настроить docker на пуш в Yandex:  yc container registry configure-docker
#
# Запуск (повторяемый — каждый прогон выкатывает новую ревизию):
#   export REGISTRY_ID=crp********           # id из `yc container registry list`
#   export SERVICE_ACCOUNT_ID=aje********    # id сервисного аккаунта контейнера
#   ./deploy-yandex-container.sh
#
# Необязательные переменные (со значениями по умолчанию):
#   CONTAINER_NAME=ok-ds-proto   IMAGE_TAG=latest
#   CORES=1   MEMORY=1GB   CONCURRENCY=4   EXEC_TIMEOUT=600s
#   SYNC_ON_START=true   # как на Railway: синкать ленту при старте
set -euo pipefail

REGISTRY_ID="${REGISTRY_ID:?Задайте REGISTRY_ID (yc container registry list)}"
SERVICE_ACCOUNT_ID="${SERVICE_ACCOUNT_ID:?Задайте SERVICE_ACCOUNT_ID сервисного аккаунта контейнера}"

CONTAINER_NAME="${CONTAINER_NAME:-ok-ds-proto}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
CORES="${CORES:-1}"
MEMORY="${MEMORY:-1GB}"
CONCURRENCY="${CONCURRENCY:-4}"
EXEC_TIMEOUT="${EXEC_TIMEOUT:-600s}"
SYNC_ON_START="${SYNC_ON_START:-true}"

IMAGE="cr.yandex/${REGISTRY_ID}/${CONTAINER_NAME}:${IMAGE_TAG}"

command -v yc     >/dev/null 2>&1 || { echo "Не найден yc CLI. Установка: https://yandex.cloud/docs/cli/quickstart" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Не найден docker." >&2; exit 1; }

echo "1/4 Собираю образ ${IMAGE}…"
docker build -t "${IMAGE}" .

echo "2/4 Пушу образ в Yandex Container Registry…"
docker push "${IMAGE}"

echo "3/4 Создаю контейнер ${CONTAINER_NAME} (если ещё нет)…"
if ! yc serverless container get --name "${CONTAINER_NAME}" >/dev/null 2>&1; then
  yc serverless container create --name "${CONTAINER_NAME}"
else
  echo "    контейнер уже есть — выкатываю новую ревизию."
fi

echo "4/4 Выкатываю ревизию…"
yc serverless container revision deploy \
  --container-name "${CONTAINER_NAME}" \
  --image "${IMAGE}" \
  --cores "${CORES}" \
  --memory "${MEMORY}" \
  --concurrency "${CONCURRENCY}" \
  --execution-timeout "${EXEC_TIMEOUT}" \
  --environment "SYNC_ON_START=${SYNC_ON_START}" \
  --service-account-id "${SERVICE_ACCOUNT_ID}"

echo
echo "Готово ✅"
echo "Один раз сделайте контейнер публичным (без авторизации):"
echo "  yc serverless container allow-unauthenticated-invoke --name ${CONTAINER_NAME}"
echo
echo "Адрес прототипа:"
yc serverless container get --name "${CONTAINER_NAME}" --format json \
  | (grep -o '"url": *"[^"]*"' || true)
echo "(или: yc serverless container get --name ${CONTAINER_NAME})"
