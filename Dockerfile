# syntax=docker/dockerfile:1
#
# keys.justworks — single-artifact deploy image.
#
# The Rust server embeds the web build at compile time (rust-embed,
# #[folder = "../packages/web/build/"]), so the binary serves the site with no
# external assets. This image produces that self-contained binary and runs it
# as a non-root user with a /data volume for the sqlite store.
#
#   docker build -t keys-justworks .
#   docker run -p 3000:3000 -v keys-justworks-data:/data keys-justworks
#
# Env (all optional):
#   LISTEN_ADDR   default 0.0.0.0:3000
#   DATABASE_URL  default sqlite:keys.db  -> resolves to /data/keys.db (WORKDIR)
#   RUST_LOG      tracing filter (default info)

###### 1. web build (SvelteKit static -> packages/web/build) ##################
FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
# copy manifests first for a cached dependency install, then the sources.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile
# the /docs route imports docs/integration.md via ?raw (relative path escapes the
# package up to the repo root), so docs/ must be present at /app/docs/ for vite.
COPY docs/ ./docs/
RUN pnpm --filter @kj/web build

###### 2. server build (embeds the web build via rust-embed) ##################
FROM rust:1-slim-bookworm AS server
WORKDIR /app
# web assets must be present before cargo build so rust-embed can embed them.
COPY --from=web /app/packages/web/build/ ./packages/web/build/
COPY server/ ./server/
WORKDIR /app/server
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/server/target \
    cargo build --release --locked && \
    cp target/release/keys-justworks-server /keys-justworks-server

###### 3. runtime #############################################################
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 1000 app && mkdir -p /data && chown app:app /data
WORKDIR /data
COPY --from=server /keys-justworks-server /usr/local/bin/keys-justworks-server
USER app
VOLUME /data
EXPOSE 3000
ENTRYPOINT ["keys-justworks-server"]
