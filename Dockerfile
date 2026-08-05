# Dockerfile — образ прототипа OK DS для Yandex (VM/Serverless Containers).
#
# Внутри крутится server.mjs: раздаёт готовую статику, и только. Контент
# обновляет автор локально (scripts/fetch-*.mjs) и коммитит в репозиторий —
# синка из Google-таблицы на сервере нет. Зависимость одна — sharp (нужна
# скриптам сбора, не серверу).
#
# PORT приходит из окружения (Yandex прокидывает сам).
FROM node:22-slim

WORKDIR /app

# git + ca-certificates — для коммита/пуша синка по https.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Зависимости (sharp) отдельным слоем для кэша.
COPY package.json ./
RUN npm install --omit=dev || true

# Код прототипа (БЕЗ .git — он исключён в .dockerignore, иначе раздувает образ
# и переполняет диск VM). Для git-сохранения .git подаётся монтированием, не в образ.
COPY . .

# Локальный дефолт; в Yandex значение придёт из окружения.
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.mjs"]
