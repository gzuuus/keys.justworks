# AGENTS.md

Operating manual for coding agents working on **keys.justworks**. This file is the
fast layer: commands, constraints, conventions. The *why* lives in the deeper docs —
read them before changing anything security-sensitive.

- **`docs/design.md`** — security model, data model, threat analysis, REST contract.
- **`docs/architecture.md`** — repo structure, build/dev workflow, component roles.

## Project overview

Non-custodial Nostr key locker. Users store an encrypted `ncryptsec` ([NIP-49]) on a
server and retrieve + decrypt it locally on any device. The server never sees
plaintext keys and cannot link accounts to Nostr identities. Four components:

| Component          | Stack              | Role                                                                                |
|--------------------|--------------------|-------------------------------------------------------------------------------------|
| `server/`          | Rust (axum+sqlite) | stores/serves `ncryptsec` behind stateless auth; serves the bundled static site. Never decrypts, never signs. |
| `packages/web/`    | SvelteKit (static) | onboarding, login, [NIP-46] remote-signer bunker; key in a Web Worker.              |
| `packages/extension/` | TS, MV3         | [NIP-07] `window.nostr` signer; isolated keyholding. (built later)                  |
| `packages/core/`   | TS                 | shared, byte-identical crypto glue + REST client.                                   |

## Non-negotiable constraints

A key-management project. These are invariant — do not violate without explicit
approval, and push back if a request seems to:

1. **Server stores exactly** `{ H(identifier), argon2(scrypt(password)), ncryptsec }`. No
   plaintext identifier, no npub, no email, no metadata. If you're adding a column,
   stop and confirm.
2. **Server never decrypts, never signs.** All crypto is client-side.
3. **The keystone passphrase is `identifier ‖ password`** (exact concatenation), and
   **`H(identifier)`** is computed client-side. Both live **only** in `packages/core`
   and must be byte-identical across `web` and `extension` — a user registers on one
   surface and logs in on another. Never re-implement them in a surface.
4. **Stateless auth only.** Every mutating endpoint re-verifies
   `{ identifier_hash, password }` inline. No sessions, tokens, or cookies.
5. **[NIP-49] is the blob format.** No custom crypto. No [NIP-26] (deprecated).
6. **No recovery by design.** Do not add password reset, email recovery, or any
   server-side path that reconstructs a key. Availability, not reset, is the value.
7. **Disclose identifier strength, never enforce it.** No server-side rejection of
   "weak" identifiers — that's a footgun, not safety.
8. **Mark deliberate shortcuts** with a `ponytail:` comment naming the ceiling and
   upgrade path (e.g. `// ponytail: global lock, per-account locks if throughput matters`).

## Development commands

All orchestration is in the `Makefile`. Ports: **API** `:3000`, **web** `:5173`
(proxies `/api/*` → `:3000`).

```
make help            # list all targets
make install         # pnpm install across the workspace
make dev             # api (:3000) + web (:5173) in parallel
make dev-api         # Rust API only (no web build; pair with dev-web)
make dev-web         # Vite dev server only
make dev-extension   # extension watch build
make serve           # prod-like: build web, then run server on :3000
make build           # build web, then server (embeds web assets)
make clean
```

Rust (`server/`): `cargo fmt`, `cargo clippy --all-targets`, `cargo test`, `cargo run`.
Run the bundled site end-to-end: `make serve` (builds web, then runs the server on :3000).
JS (`packages/`): pnpm workspaces — `pnpm --filter @kj/<pkg> run <script>`.

> Several targets are live only after the corresponding package is scaffolded
> (`server/`, `packages/`). `make help` works today.

## Working in the monorepo

- **pnpm workspaces** (`pnpm-workspace.yaml` → `packages/*`).
  - Add a dep to one package: `pnpm --filter @kj/web add <pkg>`.
  - Install everything: `pnpm install` at root (or `make install`).
- **No Cargo workspace** — `server/` is a single crate. Add a second Rust crate
  before introducing a workspace.
- **`packages/core` is imported as a workspace package** by `web` and `extension`.
  Never copy its logic into a surface. Changing it is a contract change — rebuild
  every consumer.
- **API is namespaced under `/api/*`**; the static site is served at everything else
  by the same binary. Don't add API routes outside `/api`.

## Code style

- **Rust:** `cargo fmt` (default style), `cargo clippy` clean. Error types via
  `thiserror`; no panics in handlers. Async via tokio. SQL via sqlx (compile-time
  checked) or rusqlite — pick one at scaffolding and stay consistent.
- **TypeScript:** `strict: true`. Prefer union types over enums where a union
  suffices. No `any` without a `// ponytail:` justification.
- **Naming:** Rust `snake_case`, TS `camelCase`, types `PascalCase`. REST fields are
  `snake_case` in JSON to match the server (e.g. `identifier_hash`, `password_verifier`).
- Prefer the ladder before writing new code: stdlib → existing dependency → minimal
  code. Reuse what's already in the repo before reaching for a new crate/npm package.

## Testing

- **Rust:** `cargo test` in `server/`. Non-trivial logic (a branch, parser, crypto
  path) ships with at least one check — the smallest thing that fails if the logic
  breaks.
- **TS:** Vitest per package (`pnpm --filter @kj/<pkg> test`), wired when a package
  gets real logic. `packages/core`'s passphrase / `H(identifier)` MUST have a
  golden-vector test (known input → expected bytes) to catch cross-surface drift.
- Trivial one-liners need no test.

## Commits and iteration

**Atomic commits, one logical change each.** If a change spans `core` + a surface
and is inseparable (e.g. changing the API contract), it's one commit; otherwise split.

**Conventional Commits:**

```
type(scope): subject

body — why over how, wrapped ~72 cols

BREAKING CHANGE: note            # only when applicable
```

- **types:** `feat` `fix` `docs` `refactor` `test` `chore` `build` `ci` `perf` `revert`
- **scopes:** `server` `api` `web` `core` `extension` `docs` `deps`
- **subject:** imperative mood, lowercase, ≤72 chars, no trailing period
- **breaking:** append `!` after scope (`feat(api)!: …`) and/or a `BREAKING CHANGE:` footer

Examples:
```
feat(api): add POST /api/register with argon2 verifier
fix(core): correct byte order in identifier‖password concat
docs: add architecture and repo structure
refactor(server): collapse /login and /blob into stateless auth
```

**Iteration:** small increments, each leaving the tree building and tests green. One
iteration → a few atomic commits, never one mega-commit. Ship the lazy version first
(see the ladder under Code style), then question it in the response.

## When you change the security surface

Anything touching crypto, the keystore, the data model, or the auth model: read
`docs/design.md` first (especially *Threat model* and *Core design*), state the
design impact in the commit body, and prefer asking over assuming. These are the
changes where a confident small diff in the wrong place is a second bug.

## Not yet established

- CI pipeline, formal lint/format configs, deployment — to be added. Don't assume
  they exist; don't add speculatively.
- Per-package `AGENTS.md` (server, web) — add when a package grows complex enough to
  need its own; the root file plus `docs/` covers it for now.

[NIP-07]: https://nips.nostr.com/7
[NIP-26]: https://nips.nostr.com/26
[NIP-46]: https://nips.nostr.com/46
[NIP-49]: https://nips.nostr.com/49
