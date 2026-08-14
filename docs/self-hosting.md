# Self-hosting keys.justworks

Everything a self-hoster needs. The server is a single static binary (the
website is embedded inside it), backed by SQLite — there is no other state.

**What you take on by self-hosting:** availability, TLS, backups. That's the
whole job — the security model needs nothing from you. The server never sees
plaintext keys and cannot recover them: there is **no password reset, no
key reconstruction, no account recovery** anywhere in the system. If your
users lose both their identifier and their password, the key is gone. Your
backups are the *only* availability guarantee.

## Quick start (systemd, recommended)

One line — installs the latest release (sha256-verified), a dedicated system
user, a hardened systemd service on `127.0.0.1:3000`, hourly SQLite backups,
and the browser-extension artifacts for auto-update:

```sh
curl -fsSL https://raw.githubusercontent.com/gzuuus/keys.justworks/main/scripts/setup.sh | sudo bash
```

Pin a release with `VERSION=v0.1.6 ... | sudo bash`. Upgrade by re-running it
(idempotent; db and backups are preserved).

The server binds **localhost only**. Terminate TLS with a reverse proxy:

```caddyfile
# Caddyfile — automatic Let's Encrypt
keys.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

nginx equivalent:

```nginx
server {
    listen 443 ssl http2;
    server_name keys.example.com;
    # ssl_certificate ...; ssl_certificate_key ...;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
}
```

DNS: point `keys.example.com` at the VPS, open 80/443, done.

## Docker alternative

```sh
docker run -d --name keys-justworks \
  -p 127.0.0.1:3000:3000 \
  -v keys-justworks-data:/data \
  ghcr.io/gzuuus/keys.justworks:latest
```

Same reverse proxy in front. The SQLite db lives in the `keys-justworks-data`
volume (`/data/keys.db`). For extension artifacts add
`-e KJ_EXTENSION_DIR=/data/extension` and sync them into the volume (see below).

## Configuration

All environment variables, all optional:

| variable           | default                | notes                                            |
|--------------------|------------------------|--------------------------------------------------|
| `LISTEN_ADDR`      | `0.0.0.0:3000` (systemd install pins `127.0.0.1:3000`) | bind address |
| `DATABASE_URL`     | `sqlite:keys.db`       | relative to the working dir (`/data` in Docker)  |
| `RUST_LOG`         | `info`                 | `tracing` filter (`debug`, `keys_justworks_server=trace`, …) |
| `KJ_EXTENSION_DIR` | unset                  | dir with `update.xml` + `keys-justworks.crx`, served at `/extension/*` |

`KJ_EXTENSION_DIR` unset → `/extension/*` returns 404 and the site's download
page hides the live version chip. Harmless. The setup one-liner maintains this
dir for you; with Docker or a manual install, sync it yourself:

```sh
curl -fsSL https://raw.githubusercontent.com/gzuuus/keys.justworks/main/scripts/sync-extension.sh \
  | bash -s -- /data/extension            # newest ext-v* release, sha256-verified
```

Note: serving the artifacts lets your deployment *deliver* the official
extension build; the build itself still talks to whatever server the user
configures (below) and updates from the official origin baked into the `.crx`.

## Backups and restore

The systemd install backs up hourly to `/var/backups/keys.justworks/` (keeps
~168 ≈ one week) via `sqlite3 .backup` — always a consistent snapshot, safe on
a running server. Docker: cron it yourself against the volume.

Test a restore (you have not backed up until you have restored):

```sh
systemctl stop keys-justworks-server
gunzip -c /var/backups/keys.justworks/<snapshot>.db.gz \
  > /var/lib/keys-justworks-server/keys.db
systemctl start keys-justworks-server
```

Offsite copies matter: the backups live on the same disk as the db. Rsync them
elsewhere — `sqlite3 .backup` snapshots are plain files, `scp`/`rsync` is the
whole story. **Legal note:** the db contains only `H(identifier)`, an argon2
verifier, and encrypted blobs (see `docs/design.md`) — but treat it as
sensitive anyway; it is your users' only copy of their encrypted key.

## Pointing the surfaces at your server

- **Website** — your server *is* the website (it's embedded). Nothing to do.
- **Browser extension** — the extension defaults to the official server, but
  any user can point it at yours: open the extension → **Manage → Server** →
  set the API base, e.g. `https://keys.example.com/api`. The key, the crypto,
  and the account then live entirely against your deployment.

## What's deliberately not configurable

- **No SMTP, no email, no reset hooks.** Recovery-by-admin is a backdoor we
  don't ship; see `docs/design.md` ("no recovery by design").
- **Rate limits** are compiled-in defaults (register/login share a per-IP
  bucket tuned for a single VPS). If you're behind a shared egress and hit it,
  file an issue — exposing them as config hasn't been needed yet.
- **CSP and security headers** are set by the server and not overridable; a
  proxy must not strip them.

## Where things live (systemd install)

| what              | where                                              |
|-------------------|----------------------------------------------------|
| binary            | `/usr/local/bin/keys-justworks-server`             |
| sqlite db         | `/var/lib/keys-justworks-server/keys.db`           |
| service           | `systemctl {status,restart} keys-justworks-server` |
| logs              | `journalctl -u keys-justworks-server -f`           |
| backups           | `/var/backups/keys-justworks/` (hourly, ~1 week)   |
| extension files   | `/opt/keys.justworks/extension` (→ `/extension/*`) |

## Health check

`GET /api/health` returns `200` with body `ok` — use it for uptime monitors
(UptimeRobot, and so on). No auth, no state.
