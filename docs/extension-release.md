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

Not implemented. A sideloaded `.crx` with no `update_url` does **not** auto-update
— users re-download each release. Wiring auto-update needs: an `update_url`
pointing at a hosted **update XML** (crx3 emits one via its `-x` flag), hosted
e.g. at `keys.justworks.cash`, plus a version-check endpoint. Add it when the
manual-sideload flow starts to hurt.
