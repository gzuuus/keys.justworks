# keys.justworks

Non-custodial Nostr key locker. Users store an encrypted `ncryptsec`
([NIP-49]) on a server and retrieve + decrypt it locally on any device. The
server never sees plaintext keys and cannot link accounts to Nostr identities.

| Component          | Stack              | Role                                                                                |
|--------------------|--------------------|-------------------------------------------------------------------------------------|
| `server/`          | Rust (axum+sqlite) | stores/serves `ncryptsec` behind stateless body-auth; serves the bundled static site. Never decrypts, never signs. |
| `packages/web/`    | SvelteKit (static) | onboarding, login, [NIP-46] remote-signer bunker; key in a Web Worker.              |
| `packages/extension/` | TS, MV3         | [NIP-07] `window.nostr` signer; isolated keyholding.                               |
| `packages/core/`   | TS                 | shared, byte-identical crypto glue + REST client.                                   |

**Security model, data model, threat analysis:** [`docs/design.md`](docs/design.md).
**Repo structure, build/dev workflow, releasing:** [`docs/architecture.md`](docs/architecture.md).

## Deploy on a VPS

One line — installs the latest release (sha256-verified), a dedicated system
user, a hardened systemd service on `127.0.0.1:3000`, and hourly sqlite backups:

```sh
curl -fsSL https://raw.githubusercontent.com/gzuuus/keys.justworks/main/scripts/setup.sh | sudo bash
```

Pin a release with `VERSION=v0.1.1 ... | sudo bash`. Upgrade by re-running it.
Full self-hosting guide — Docker, TLS, backups & restore, pointing the
extension at your server: [`docs/self-hosting.md`](docs/self-hosting.md).

The server binds **localhost only** — terminate TLS with a reverse proxy:

```caddyfile
# Caddyfile — automatic Let's Encrypt
keys.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

| what      | where                                              |
|-----------|----------------------------------------------------|
| binary    | `/usr/local/bin/keys-justworks-server`             |
| sqlite db | `/var/lib/keys-justworks-server/keys.db`           |
| service   | `systemctl {status,restart} keys-justworks-server` |
| logs      | `journalctl -u keys-justworks-server`              |
| backups   | `/var/backups/keys-justworks/` (hourly, ~1 week)   |

> **Backups are the availability story.** There is **no recovery by design** —
> no password reset, no server-side key reconstruction. Keep the backups, and
> test a restore: stop the service, then `gunzip -c <snapshot>.db.gz > /var/lib/keys-justworks-server/keys.db`.

Prefer Docker? The release also publishes an image:
`docker run -p 3000:3000 -v keys-justworks-data:/data ghcr.io/gzuuus/keys.justworks:latest`
(then put the same Caddy in front).

## Develop

```
make install     # pnpm install across the workspace
make dev         # api :3000 + web :5173 (proxies /api/* -> :3000)
make serve       # prod-like: build web, run server on :3000
```

See [`docs/architecture.md`](docs/architecture.md) for the full workflow and
`make help` for all targets. Cutting a release: `make patch|minor|major`.

[NIP-07]: https://nips.nostr.com/7
[NIP-46]: https://nips.nostr.com/46
[NIP-49]: https://nips.nostr.com/49
