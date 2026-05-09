FROM oven/bun:1-slim AS deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build

FROM oven/bun:1-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    MONITOR_KVM_CREDENTIALS=/data/credentials.json

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production && \
    mkdir -p /data && \
    chown -R bun:bun /app /data

COPY --from=build --chown=bun:bun /app/src ./src
COPY --from=build --chown=bun:bun /app/public ./public

USER bun
EXPOSE 3000
VOLUME ["/data"]

CMD ["bun", "run", "src/index.ts"]
