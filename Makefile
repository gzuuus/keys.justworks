# keys.justworks — development tasks
#
# Ports:
#   API (Rust/axum)  :3000
#   Web (Vite)       :5173   (proxies /api/* -> http://localhost:3000)

API_PORT   := 3000
WEB_PORT   := 5173
SERVER_DIR := server
WEB_DIR    := packages/web
EXT_DIR    := packages/extension

.PHONY: help install dev dev-api dev-web dev-extension serve build build-web build-server clean patch minor major ext-patch ext-minor ext-major crx

help: ## show this help
	@grep -hE '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## install workspace dependencies (pnpm)
	pnpm install

dev: ## run api + web together (parallel)
	$(MAKE) -j 2 dev-api dev-web

dev-api: ## run the Rust api on :$(API_PORT) (api only — no web build; pair with dev-web)
	cd $(SERVER_DIR) && cargo run

dev-web: ## run the Vite dev server on :$(WEB_PORT) (proxies /api -> :$(API_PORT))
	cd $(WEB_DIR) && pnpm dev

serve: build-web ## prod-like: build web then run server (serves bundled site on :$(API_PORT))
	cd $(SERVER_DIR) && cargo run

dev-extension: ## build the extension to dist/ (load unpacked; re-run after edits)
	cd $(EXT_DIR) && pnpm build

build-web: ## build the static web assets -> packages/web/build
	cd $(WEB_DIR) && pnpm build

build-server: ## build the Rust server binary (embeds web assets)
	cd $(SERVER_DIR) && cargo build --release

build: build-web build-server ## build web then server

clean: ## remove build artifacts
	-cd $(WEB_DIR) && rm -rf build .svelte-kit
	-cd $(SERVER_DIR) && cargo clean

# --- releasing ----------------------------------------------------------------
# `make patch|minor|major` bumps server/Cargo.toml, commits, tags vX.Y.Z, and
# pushes — the tag triggers .github/workflows/release.yml (docker image + binaries).
patch: ## release: bump patch (0.1.0 -> 0.1.1), tag, push (triggers CI)
	@./scripts/release.sh patch
minor: ## release: bump minor (0.1.0 -> 0.2.0), tag, push
	@./scripts/release.sh minor
major: ## release: bump major (0.1.0 -> 1.0.0), tag, push
	@./scripts/release.sh major

# Extension releases are decoupled from server releases (server uses v* tags;
# extension uses ext-v*). `make ext-patch|ext-minor|ext-major` bumps the
# extension version, commits, tags ext-vX.Y.Z, and pushes — the tag triggers
# .github/workflows/release-extension.yml, which packs a signed .crx onto a
# GitHub Release. `make crx` packs a .crx locally for ad-hoc testing — set
# CRX_KEY to your private key path (default: extension.pem in the repo root).
ext-patch: ## ext release: bump patch, tag ext-vX.Y.Z, push (triggers crx CI)
	@./scripts/release-extension.sh patch
ext-minor: ## ext release: bump minor, tag ext-vX.Y.Z, push
	@./scripts/release-extension.sh minor
ext-major: ## ext release: bump major, tag ext-vX.Y.Z, push
	@./scripts/release-extension.sh major

CRX ?= keys-justworks.crx
CRX_KEY ?= extension.pem
crx: ## build the extension and pack a signed .crx (set CRX_KEY=path/to/key.pem)
	cd $(EXT_DIR) && pnpm build
	npx -y crx3@2 -o "$(CRX)" -p "$(CRX_KEY)" $(EXT_DIR)/dist
