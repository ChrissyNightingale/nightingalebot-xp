# Multi-step Dockerfile for the XP bot. Builds better-sqlite3 native
# bindings against the runtime's Node ABI, then ships a slim runtime image.

FROM node:22-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 needs a toolchain to compile its native binding.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev


FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV DB_PATH=/data/xp.sqlite
ENV CRON_STATE_PATH=/data/cron-state.json

# Copy compiled deps + source.
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY fonts ./fonts

# Seed snapshot of the cron bot's state — used on first boot only, so we
# don't lose months of de-duplication state from the GH Actions bot.
COPY seed-cron-state.json ./seed-cron-state.json

# Volume mount target — Fly attaches /data here.
RUN mkdir -p /data

CMD ["node", "src/index.js"]
