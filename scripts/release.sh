#!/usr/bin/env bash
# Bump server/Cargo.toml to the next version, commit, tag vX.Y.Z, and push.
# The tag triggers .github/workflows/release.yml (docker image + binaries).
#
#   ./scripts/release.sh patch   # 0.1.0 -> 0.1.1
#   ./scripts/release.sh minor   # 0.1.0 -> 0.2.0
#   ./scripts/release.sh major   # 0.1.0 -> 1.0.0
#
# Set ALLOW_DIRTY=1 to release while carrying parallel WIP; the release commit
# is scoped to server/Cargo.{toml,lock} so unrelated work is never bundled.
#
# Cargo.toml is the single source of truth for releases (the deployable is the
# server binary; the TS packages are private and unpublished). Cargo.lock is
# refreshed so release builds stay --locked-clean.
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
manifest="$root/server/Cargo.toml"

cur=$(grep -m1 '^version = ' "$manifest" | sed -E 's/^version = "(.*)"$/\1/')
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

# never bundle unrelated work into a release commit. The bump commit is scoped
# to server/Cargo.{toml,lock}, so ALLOW_DIRTY=1 is safe to set when you're
# intentionally carrying parallel WIP (e.g. in another package).
if [ -z "${ALLOW_DIRTY:-}" ] && [ -n "$(git -C "$root" status --porcelain)" ]; then
  echo "error: working tree not clean — commit or stash first, or rerun with ALLOW_DIRTY=1" >&2
  exit 1
fi

echo "bumping $cur -> $new"
sed -i -E "s/^version = \".*\"/version = \"$new\"/" "$manifest"
(cd "$root/server" && cargo check -q) # refresh Cargo.lock for --locked builds

git -C "$root" add server/Cargo.toml server/Cargo.lock
git -C "$root" commit -q -m "chore(release): v$new"
git -C "$root" tag -a "v$new" -m "Release v$new"
echo "tagged v$new — pushing (triggers release CI)..."
git -C "$root" push --follow-tags
echo "done: v$new pushed."
