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

.PHONY: help install dev dev-api dev-web dev-extension build build-web build-server clean

help: ## show this help
	@grep -hE '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## install workspace dependencies (pnpm)
	pnpm install

dev: ## run api + web together (parallel)
	$(MAKE) -j 2 dev-api dev-web

dev-api: ## run the Rust api on :$(API_PORT)
	cd $(SERVER_DIR) && cargo run

dev-web: ## run the Vite dev server on :$(WEB_PORT) (proxies /api -> :$(API_PORT))
	cd $(WEB_DIR) && pnpm dev

dev-extension: ## build the extension in watch mode (load unpacked in browser)
	cd $(EXT_DIR) && pnpm dev

build-web: ## build the static web assets -> packages/web/build
	cd $(WEB_DIR) && pnpm build

build-server: ## build the Rust server binary (embeds web assets)
	cd $(SERVER_DIR) && cargo build --release

build: build-web build-server ## build web then server

clean: ## remove build artifacts
	-cd $(WEB_DIR) && rm -rf build .svelte-kit
	-cd $(SERVER_DIR) && cargo clean
