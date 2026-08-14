# Extension release pipeline

How the Chrome extension gets built into a signed `.crx` and published as a
GitHub Release users can download and install.

The extension is **not** on the Chrome Web Store — users sideload the `.crx`
with Developer Mode on. There is no auto-update yet (see [Auto-update](#auto-update)).

## Decoupled from server releases

| Component | Version source     | Tag       | Workflow                       |
|-----------|--------------------|-----------|--------------------------------|
| server    | `server/Cargo.toml`| `vX.Y.Z`  | `.github/workflows/release.yml`|
| extension | `manifest.config.ts` + `package.json` | `ext-vX.Y.Z` | `.github/workflows/release-extension.yml` |

The two release independently. Extension tags use the `ext-v*` prefix so they
never collide with server `v*` tags.

## One-time setup: the signing key

The `.crx` is signed with an RSA private key. **The key determines the extension
ID**, so it must be **stable across every release** — change the key and the ID
changes, breaking in-place updates (each release becomes a "different" extension).

1. Generate a key (once, keep it safe — losing it means a new extension ID and a
   forced re-install for everyone):

   ```sh
   openssl genrsa -out extension.pem 2048
   ```

   `extension.pem` is gitignored. Back it up somewhere durable (password manager,
   offline store). There is no recovery for a lost signing key.

2. Base64-encode it and add it as a **repository secret** named
   `CRX_PRIVATE_KEY` (Settings → Secrets and variables → Actions):

   ```sh
   base64 -w0 extension.pem        # macOS: base64 -i extension.pem
   ```

   The workflow base64-decodes this back into `/tmp/crx.pem` at build time and
   shreds it after packing.

That's it. The first release tells you the extension ID — it's shown at
`chrome://extensions` after installing.

## Releasing

From a clean working tree:

```sh
make ext-patch   # 0.0.1 -> 0.0.2
make ext-minor   # 0.0.1 -> 0.1.0
make ext-major   # 0.0.1 -> 1.0.0
```

This bumps the version in `manifest.config.ts` (authoritative — what crxjs packs
into the CRX) and `package.json` (workspace metadata), commits the bump, tags
`ext-vX.Y.Z`, and pushes. The tag triggers `release-extension.yml`, which builds
the extension, packs a signed `keys-justworks.crx` (+ a `.sha256`), and attaches
both to a GitHub Release for the tag.

Carrying parallel WIP? `ALLOW_DIRTY=1 make ext-patch` — the bump commit is scoped
to the two version files, so unrelated work is never bundled in.

## Installing the `.crx` (sideload)

1. Download `keys-justworks.crx` from the release.
2. Open `chrome://extensions`, turn on **Developer mode**.
3. Drag the `.crx` onto the page (or "Load unpacked" on the unpacked `dist/`).

**Caveat:** Chrome treats non-Web-Store extensions as untrusted. It may show a
"Disable developer mode extensions" prompt on restart, and an enterprise policy
(`ExtensionInstallAllowlist` + `ExtensionSettings`) is the supported way to
deploy sideloaded extensions org-wide without that friction. For a handful of
users on personal machines, Developer Mode is fine.

## Building a `.crx` locally

For ad-hoc testing with your key:

```sh
make crx CRX_KEY=path/to/extension.pem
# -> keys-justworks.crx in the repo root
```

This is exactly the command CI runs (same `crx3` version, same flags).

## Auto-update

Implemented, with a caveat. The manifest carries `update_url` → `https://keys.justworks.cash/extension/update.xml`;
release CI packs the GUpdate manifest (`update.xml`, with the `appid` derived from the
signing key) alongside the `.crx`; a deployment serves both under `/extension/*`.

**The caveat:** Chrome only *applies* `update_url` updates to policy/Linux installs.
For the drag-installed `.crx` on Windows/macOS (the documented install path), Chrome
never pulls the update — it does nothing, silently. So the extension watches its own
server: the SW fetches `/extension/update.xml` every ~6h (and on install/update), and
when the advertised version is newer than the running one it sets an amber badge on
the toolbar icon and the popup shows a banner linking to the site's `/download`
page. The user re-drags the `.crx`; the data (cached blobs, permissions, config) all
survive because the extension ID is stable. This works unchanged for self-hosters —
the check resolves against whatever API base the extension is configured with.

Deploy-side, nothing manual: `scripts/setup.sh` (the VPS one-liner, run with
`HOST_EXTENSION=1` — extension hosting is opt-in, official provider only) syncs
the newest `ext-v*` release into `/opt/keys.justworks/extension` (sha256-verified
before the live files are replaced) and sets `KJ_EXTENSION_DIR` in the systemd
unit. The extension stream is pinned independently of the server pin —
`EXT_VERSION=ext-v0.0.3` pins it, otherwise always newest. For an
extension-only update (no server release), just re-run setup.sh with the flag
(it's idempotent; an already-hosting unit keeps `KJ_EXTENSION_DIR` across plain
upgrades, `HOST_EXTENSION=0` removes it) or run
`scripts/sync-extension.sh /opt/keys.justworks/extension` directly on the VPS.
A failed sync never aborts a server upgrade; `/extension/*` just 404s (by
design) until the next run.

Note: the first release to carry `update.xml` is whatever comes after `ext-v0.0.2` — the
CI change postdates it. Until then, syncs of `ext-v0.0.2` will warn and skip.

Self-hosters serving their *own* `/extension` still can't redirect the official build's
updates at themselves: `update_url` is baked into the signed `.crx`. That's fine — a
self-hosted *extension* build means a different signing key (different appid) anyway.

**Caveats.** Unpacked ("load unpacked") installs never auto-update — steer users to the
`.crx`. And Chrome is progressively hostile to off-Store extensions; if drag-dropped
installs get flagged, the supported org-wide route is enterprise policy
(`ExtensionInstallForcelist` with `<appid>;<update_url>`), which installs *and* updates
silently. The appid is in `update.xml`.
