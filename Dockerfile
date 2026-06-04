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

# Copy compiled deps + source.
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

# Volume mount target — Fly attaches /data here.
RUN mkdir -p /data

CMD ["node", "src/index.js"]
