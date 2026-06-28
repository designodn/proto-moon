# Dockerfile — образ прототипа OK DS для Yandex (VM/Serverless Containers).
#
# Внутри крутится server.mjs: раздаёт статику и сам пересобирает ленту из
# Google-таблицы (scripts/fetch-all.mjs) при старте и по кнопке на лендинге.
# Зависимость одна — sharp (сжатие картинок в webp при синке). git нужен, чтобы
# кнопка-синк коммитила и пушила результат (см. YANDEX-CLOUD.md, env GITHUB_TOKEN/
# SYNC_GIT_PUSH_URL). Node 22 — за встроенный fetch (gviz-таблица, fetchLinkMeta).
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
