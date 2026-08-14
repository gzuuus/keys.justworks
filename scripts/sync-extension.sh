#!/usr/bin/env bash
# Sync extension release artifacts (update.xml + keys-justworks.crx) from a
# GitHub release into a directory the server serves at /extension/ — set
# KJ_EXTENSION_DIR to that directory on the server. This is what makes both the
# download page (/download) and Chrome auto-update work; run it once after each
# extension release. See docs/extension-release.md.
#
#   ./scripts/sync-extension.sh /srv/keys/extension              # newest ext-v*
#   ./scripts/sync-extension.sh /srv/keys/extension ext-v0.0.3   # pin a tag
#
# The .sha256 is verified before the live files are replaced, so a truncated
# download can't break auto-update. Uses the unauthenticated GitHub API
# (60 req/h) for tag discovery only — deploy-time one-shot, that's plenty.
set -euo pipefail

dir="${1:?usage: $0 <dir> [tag]}"
tag="${2:-}"
repo="gzuuus/keys.justworks"

if [ -z "$tag" ]; then
  tag=$(curl -fsSL "https://api.github.com/repos/$repo/releases?per_page=100" \
    | grep -oE '"tag_name": *"ext-v[0-9.]+"' | head -1 | grep -oE 'ext-v[0-9.]+')
  [ -n "$tag" ] || { echo "error: no ext-v* release found for $repo" >&2; exit 1; }
fi
echo "syncing $tag -> $dir"

base="https://github.com/$repo/releases/download/$tag"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
for f in update.xml keys-justworks.crx keys-justworks.crx.sha256; do
  curl -fsSL -o "$tmp/$f" "$base/$f"
done
(cd "$tmp" && sha256sum -c keys-justworks.crx.sha256)

mkdir -p "$dir"
install -m 0644 "$tmp/update.xml" "$dir/update.xml"
install -m 0644 "$tmp/keys-justworks.crx" "$dir/keys-justworks.crx"
echo "done: $tag is served at /extension/{update.xml,keys-justworks.crx}"
