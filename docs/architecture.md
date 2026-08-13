# Architecture

Polyglot monorepo: a Rust HTTP server that also serves a bundled Svelte static
site, plus a browser extension. See [design.md](design.md) for the security
model, data model, and threat analysis; this document covers **structure,
build, and the development environment**.

## Repository structure

```
keys.justworks/
├── AGENTS.md                     # operating manual for coding agents
├── docs/
│   ├── design.md                 # security model, data model, components
│   └── architecture.md           # this file
├── server/                       # Rust — axum + sqlite, ONE deployable binary
│   ├── Cargo.toml                #   axum, tower-http, rust-embed, sqlx, argon2, sha2, base64
│   └── src/
│       └── main.rs               #   /api/* → handlers ; /* → embedded web assets
├── packages/                     # JS monorepo (pnpm workspaces)
│   ├── core/                     # shared, security-critical glue (see below)
│   ├── web/                      # SvelteKit (static adapter): onboarding + login + NIP-46 bunker
│   └── extension/                # MV3 browser extension: NIP-07 signer (later)
├── package.json                  # workspace root
├── pnpm-workspace.yaml           # workspace packages list (packages/*)
├── pnpm-lock.yaml                # lockfile (committed)
├── Makefile                      # dev/build orchestration
└── .gitignore
```

## Components

### `server/` (Rust)
A single axum binary. Serves the REST API at `/api/*` (see [design.md](design.md))
and the bundled static website at everything else. Stores accounts in SQLite.
**Never decrypts, never signs.** Web assets are embedded at compile time via
`rust-embed`, producing one self-contained binary.

### `packages/core/` (shared TS)
The security-critical glue shared by `web` and `extension`:

- `identifier ‖ password` passphrase concatenation,
- `H(identifier)` computation,
- the REST client and request/response types.

These must be **byte-identical across both surfaces** — a user may register on
the web and log in from the extension (or vice versa), and any drift in the
concatenation or hashing silently breaks cross-surface decryption. Hence one
package, imported by both. It holds only what must be identical; no speculative
abstractions.

### `packages/web/` (SvelteKit, static)
The project's main site: onboarding (key generation/import), login, and the
[NIP-46] remote-signer bunker. Built with SvelteKit's static adapter to a folder
of static assets that `server/` embeds. Primary surface on mobile.

### `packages/extension/` (MV3)
The secure signing surface: [NIP-07] `window.nostr`. Fetches the `ncryptsec` on
login, decrypts, and holds the key in an isolated context. Strongest surface —
input and keyholding are both isolated from page JS.

## Why the website is bundled into the server

One origin, one deploy artifact, one TLS cert. The bundled site needs no CORS —
its fetches to `/api/*` are same-origin (the open-CORS layer below is harmless
on top). No security regression: the operator controls the served JS either
way, and the Web Worker keyholder isolation is unaffected by how the bytes are
delivered. The website remains a standalone-buildable package, so moving it to
a CDN later is a deployment change, not an architecture change.

## Third-party app integration (open CORS)

Other apps may embed keys.justworks as their key backend — a user registers and
logs in from the integrator's own origin, calling `/api/*` cross-origin. The
server runs an **open CORS policy** (`Access-Control-Allow-Origin: *`) so any
app can integrate without per-origin onboarding.

Why this is safe: every endpoint authenticates with `identifier_hash` +
`password_secret` **in the request body**, never cookies or an Authorization
header. There is no ambient authority for a cross-site attacker to forge (no
CSRF vector), and `Access-Control-Allow-Credentials` is off (incompatible with
`*`, and we don't need it — auth is body-only). A malicious origin calling
`/api/login` gets 401: the user's browser attaches nothing on their behalf, and
the secret must be supplied in the body. The residual is anonymous register
spam, which rate limiting covers (per-IP at the reverse proxy, per-account
in-app before scale) — not CORS config.

Integrators consume `@kj/core` (`setApiBase(...)` for the cross-origin client,
plus the byte-identical `identifierHash`/`passwordSecret`/`encryptSecret`/
`decryptSecret`) so a user who registers on one app can decrypt their blob on
another. They do not reimplement the crypto — drift would silently break
cross-surface decryption.

## API namespacing

The API lives under `/api/*`; the static site is served at everything else. This
avoids collisions between API endpoints and client routes (e.g. the API's
`/api/login` vs the site's `/login` page).

## Build & dev workflow

### Development
- `web` runs its Vite dev server with HMR on `:5173`, proxying `/api/*` →
  `localhost:3000` where the Rust API runs. Frontend iteration needs no Rust
  recompile.
- The Rust API runs on `:3000` via `cargo run`.
- The extension runs its own dev build (load unpacked in the browser).

### Production
Build `web` → its static output is embedded into the Rust binary via `rust-embed`
→ ship one binary. The server serves the embedded assets at `/*` (with an SPA
fallback) and the API at `/api/*`.

## Development tasks (Make)

Ports: **API** `:3000`, **web** `:5173` (proxies `/api/*` → `:3000`).

| Command             | Description                                         |
|---------------------|-----------------------------------------------------|
| `make install`      | install JS workspace dependencies                   |
| `make dev`          | run API + web together (parallel)                   |
| `make dev-api`      | run the Rust API only (`:3000`)                     |
| `make dev-web`      | run the Vite dev server (`:5173`)                   |
| `make dev-extension`| build the extension in watch mode                   |
| `make serve`        | prod-like: build web, then run server (`:3000`)     |
| `make build-web`    | build the static web assets                         |
| `make build-server` | build the Rust server binary (embeds web)           |
| `make build`        | build web, then server                              |
| `make clean`        | remove build artifacts                              |

> All targets are live — the packages are scaffolded. `pnpm` is the package manager
> (lockfile `pnpm-lock.yaml` is committed).

## Releasing

Releases are version-tagged (`vX.Y.Z`); the tag drives
`.github/workflows/release.yml`, which publishes a Docker image to GHCR
(`ghcr.io/<owner>/<repo>:vX.Y.Z` + `:latest`, amd64) and cross-built linux
binaries (amd64, arm64) to the GitHub Release.

`server/Cargo.toml` is the single source of truth for the version — the
deployable is the server binary, and the private TS packages aren't published,
so their versions don't track releases. Cut a release with:

| Command      | Effect                                            |
|--------------|---------------------------------------------------|
| `make patch` | `0.1.0 → 0.1.1`: bump, commit, tag `vX.Y.Z`, push |
| `make minor` | `0.1.0 → 0.2.0`: bump, commit, tag, push          |
| `make major` | `0.1.0 → 1.0.0`: bump, commit, tag, push          |

`scripts/release.sh` refuses on a dirty tree and refreshes `Cargo.lock` so
release builds stay `--locked`-clean. The push triggers CI; the GitHub Release
appears when the `release` job finishes.

> The Docker image is amd64-only for now; ARM VPS deploys can use the `aarch64`
> binary asset. A multi-arch image (buildx/qemu or a native arm64 runner) is the
> follow-up.

## Deliberately not added

- **No Cargo workspace** — only one Rust crate; a workspace is YAGNI until there are two.
- **No Nx/Turborepo** — plain pnpm workspaces suffice; heavy monorepo tooling is speculative.
- **No TypeScript project references** — per-package `tsconfig`s are enough for now.

## References

- [NIP-07] `window.nostr` — https://nips.nostr.com/7
- [NIP-46] Nostr Connect (remote signer / bunker) — https://nips.nostr.com/46
- [NIP-49] Private Key Encryption (`ncryptsec`) — https://nips.nostr.com/49

[NIP-07]: https://nips.nostr.com/7
[NIP-46]: https://nips.nostr.com/46
[NIP-49]: https://nips.nostr.com/49
