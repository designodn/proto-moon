#!/usr/bin/env bash
#
# Деплой статического прототипа в Yandex Object Storage.
#
# Перед первым запуском:
#   1. Создайте бакет в Yandex Cloud (см. DEPLOY.md).
#   2. Создайте статический ключ доступа для сервисного аккаунта.
#   3. Экспортируйте переменные окружения (или положите их в ~/.aws/credentials):
#        export AWS_ACCESS_KEY_ID=<идентификатор ключа>
#        export AWS_SECRET_ACCESS_KEY=<секретный ключ>
#        export BUCKET=<имя-вашего-бакета>
#
# Запуск:
#   ./deploy.sh
#
set -euo pipefail

ENDPOINT="https://storage.yandexcloud.net"
BUCKET="${BUCKET:?Задайте переменную BUCKET с именем бакета}"

echo "Деплой в s3://${BUCKET} (${ENDPOINT})…"

# Синхронизируем содержимое репозитория, исключая служебные файлы.
aws s3 sync . "s3://${BUCKET}" \
  --endpoint-url "${ENDPOINT}" \
  --delete \
  --exclude ".git/*" \
  --exclude ".github/*" \
  --exclude "*.sh" \
  --exclude "*.md" \
  --exclude ".nojekyll"

echo "Готово. Сайт: https://${BUCKET}.website.yandexcloud.net/"
