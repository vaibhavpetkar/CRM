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

COPY package*.json ./
RUN npm ci --only=production

# Copy dist files and other necessary files (migrations, config, sequelizerc)
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/migrations ./migrations
COPY --from=builder /usr/src/app/src/config/config.js ./src/config/config.js
COPY --from=builder /usr/src/app/.sequelizerc ./.sequelizerc

EXPOSE 5000

ENV NODE_ENV=production

# Start server
CMD ["node", "dist/server.js"]
