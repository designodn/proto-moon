# Dockerfile — образ прототипа OK DS для Yandex Serverless Containers.
#
# Внутри крутится server.mjs: раздаёт статику и сам пересобирает ленту из
# Google-таблицы (scripts/fetch-all.mjs) при старте и по кнопке на лендинге.
# Бэкенд-логики нет, npm-зависимостей нет — нужен только Node 22 (встроенный
# fetch для gviz-таблицы и fetchLinkMeta).
#
# Serverless Containers сами прокидывают переменную PORT — server.mjs её читает.
FROM node:22-slim

WORKDIR /app

# Зависимостей нет, но если появятся — кэшируем установку отдельным слоем.
COPY package.json ./
RUN npm install --omit=dev || true

# Весь прототип (см. .dockerignore для исключений).
COPY . .

# Локальный дефолт; в Serverless Containers значение придёт из окружения.
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.mjs"]
