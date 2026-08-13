#!/usr/bin/env bash
# Bump the extension version, commit, tag ext-vX.Y.Z, and push. The tag triggers
# .github/workflows/release-extension.yml, which builds packages/extension and
# packs a signed .crx3 (key from the CRX_PRIVATE_KEY secret) onto a GitHub Release.
#
#   ./scripts/release-extension.sh patch   # 0.0.1 -> 0.0.2
#   ./scripts/release-extension.sh minor   # 0.0.1 -> 0.1.0
#   ./scripts/release-extension.sh major   # 0.0.1 -> 1.0.0
#
# Set ALLOW_DIRTY=1 to release while carrying parallel WIP; the release commit is
# scoped to the two version files so unrelated work is never bundled.
#
# The version lives in manifest.config.ts (authoritative — crxjs writes it into
# the packed manifest) and package.json (workspace metadata); the script bumps
# both in lockstep so they never drift.
#
# Extension tags use the ext-v* prefix so they never collide with server v* tags
# — the two release independently.
set -euo pipefail

level="${1:-}"
case "$level" in
  patch | minor | major) ;;
  *)
    echo "usage: $0 <patch|minor|major>" >&2
    exit 1
    ;;
esac

root="$(cd "$(dirname "$0")/.." && pwd)"
pkg="$root/packages/extension/package.json"
manifest="$root/packages/extension/manifest.config.ts"

# manifest.config.ts is authoritative for the packed CRX version; read it there.
# Match `  version: "x.y.z"` but NOT `  manifest_version: 3` (anchored to BOL).
cur=$(grep -E -m 1 '^[[:space:]]+version:[[:space:]]+"' "$manifest" \
  | sed -E 's/^[[:space:]]+version:[[:space:]]+"([^"]+)".*$/\1/')
IFS=. read -r major minor patch <<<"$cur"
if [[ -z "$major" || -z "$minor" || -z "$patch" ]]; then
  echo "error: could not parse version \"$cur\" in $manifest" >&2
  exit 1
fi

case "$level" in
  major) major=$((major + 1)); minor=0; patch=0 ;;
  minor) minor=$((minor + 1)); patch=0 ;;
  patch) patch=$((patch + 1)) ;;
esac
new="$major.$minor.$patch"

if [[ "$cur" == "$new" ]]; then
  echo "error: bumped to the same version ($new) — parse bug?" >&2
  exit 1
fi

# never bundle unrelated work into a release commit. The bump commit is scoped to
# the two version files, so ALLOW_DIRTY=1 is safe when you're intentionally
# carrying parallel WIP (e.g. in another package).
if [ -z "${ALLOW_DIRTY:-}" ] && [ -n "$(git -C "$root" status --porcelain)" ]; then
  echo "error: working tree not clean — commit or stash first, or rerun with ALLOW_DIRTY=1" >&2
  exit 1
fi

echo "bumping $cur -> $new"
# bump the authoritative manifest version + the workspace package metadata.
sed -i -E "s/^([[:space:]]*version:[[:space:]]*)\"[^\"]+\"/\1\"$new\"/" "$manifest"
sed -i -E "s/^([[:space:]]*\"version\":[[:space:]]*)\"[^\"]+\"/\1\"$new\"/" "$pkg"

git -C "$root" add "$pkg" "$manifest"
git -C "$root" commit -q -m "chore(release): ext-v$new"
git -C "$root" tag -a "ext-v$new" -m "Extension release ext-v$new"
echo "tagged ext-v$new — pushing (triggers extension release CI)..."
git -C "$root" push --follow-tags
echo "done: ext-v$new pushed."
