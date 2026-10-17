# Stage 1: Build the TypeScript backend
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production runner
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

# pg_dump / pg_restore for Settings > Backups. Same major version as the
# postgres:15-alpine database service, so dumps restore cleanly. If this
# Alpine release no longer ships PostgreSQL 15, fall back to the default
# client (newer pg_dump can still dump and restore a 15 server); the Backups
# page shows which version is installed.
ARG PG_CLIENT_PACKAGE=postgresql15-client
RUN apk add --no-cache "${PG_CLIENT_PACKAGE}" \
    || (echo "WARNING: ${PG_CLIENT_PACKAGE} not available, installing postgresql-client" && apk add --no-cache postgresql-client)

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy dist files and other necessary files (migrations, config, sequelizerc)
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/migrations ./migrations
COPY --from=builder /usr/src/app/src/config/config.js ./src/config/config.js
COPY --from=builder /usr/src/app/.sequelizerc ./.sequelizerc
COPY --from=builder /usr/src/app/scripts ./scripts

# Backups land here (the backups_data volume in docker-compose.yml).
RUN mkdir -p /usr/src/app/backups

EXPOSE 5000

ENV NODE_ENV=production

# Start server
CMD ["node", "dist/server.js"]
