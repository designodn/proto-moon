#!/usr/bin/env bash
#
# setup-yandex.sh — одной командой поднимает хостинг прототипа в Yandex Object Storage:
# создаёт бакет, включает раздачу как веб-сайт и заливает текущие файлы.
#
# Что нужно сделать руками ОДИН раз перед запуском (это нельзя автоматизировать):
#   1. Зарегистрироваться в Yandex Cloud (console.yandex.cloud), привязать платёжку.
#   2. Создать сервисный аккаунт с ролью storage.editor.
#   3. Создать для него СТАТИЧЕСКИЙ КЛЮЧ ДОСТУПА (идентификатор + секрет).
#   4. Поставить AWS CLI:  pip install awscli   (Object Storage S3-совместим)
#
# Запуск:
#   export AWS_ACCESS_KEY_ID=<идентификатор ключа>
#   export AWS_SECRET_ACCESS_KEY=<секретный ключ>
#   export BUCKET=ok-ds-prototype          # глобально уникальное имя (латиница/цифры/дефис)
#   ./setup-yandex.sh
#
# Повторный запуск безопасен: существующий бакет не пересоздаётся, файлы просто
# синхронизируются заново. Для последующих обновлений достаточно ./deploy.sh.
set -euo pipefail

ENDPOINT="https://storage.yandexcloud.net"
BUCKET="${BUCKET:?Задайте BUCKET с именем бакета}"
: "${AWS_ACCESS_KEY_ID:?Задайте AWS_ACCESS_KEY_ID}"
: "${AWS_SECRET_ACCESS_KEY:?Задайте AWS_SECRET_ACCESS_KEY}"

if ! command -v aws >/dev/null 2>&1; then
  echo "Не найден AWS CLI. Установите: pip install awscli" >&2
  exit 1
fi

aws_y() { aws --endpoint-url "$ENDPOINT" "$@"; }

echo "1/4 Проверяю/создаю бакет ${BUCKET}…"
if aws_y s3 ls "s3://${BUCKET}" >/dev/null 2>&1; then
  echo "    бакет уже существует — пропускаю создание."
else
  aws_y s3 mb "s3://${BUCKET}"
fi

echo "2/4 Включаю публичное чтение объектов…"
aws_y s3api put-bucket-acl --bucket "${BUCKET}" --acl public-read

echo "3/4 Включаю хостинг сайта (index.html)…"
aws_y s3 website "s3://${BUCKET}/" --index-document index.html --error-document index.html

echo "4/4 Заливаю файлы сайта…"
aws_y s3 sync . "s3://${BUCKET}" \
  --delete \
  --exclude ".git/*" \
  --exclude ".github/*" \
  --exclude ".gitverse/*" \
  --exclude "*.sh" \
  --exclude "*.md"

echo
echo "Готово ✅  Сайт: https://${BUCKET}.website.yandexcloud.net/"
echo "Для будущих обновлений запускайте ./deploy.sh"
