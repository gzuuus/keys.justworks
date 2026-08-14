#!/usr/bin/env bash
# keys.justworks — one-line installer / upgrader for the VPS.
#
#   curl -fsSL https://raw.githubusercontent.com/gzuuus/keys.justworks/main/scripts/setup.sh | sudo bash
#
# Downloads the release binary for this arch (sha256-verified), installs it,
# creates a dedicated system user, writes a hardened systemd unit, enables +
# (re)starts the service, installs the backup script on an hourly cron, and —
# only when asked — syncs the browser-extension artifacts (newest ext-v*
# release) for /extension/* (auto-update + /download). Re-running upgrades
# in place (db + backups are preserved).
#
#   VERSION=v0.1.1 ... | sudo bash          # pin a server release (default: newest v*)
#   ... | sudo env HOST_EXTENSION=1 bash    # also serve /extension/* (official provider)
#   EXT_VERSION=ext-v0.0.3 ...              # pin the extension artifacts (default: newest ext-v*)
#
# Must be root. Does NOT do TLS — see the final message.
set -euo pipefail

OWNER_REPO="gzuuus/keys.justworks"
BIN_NAME="keys-justworks-server"
USER_NAME="keys-justworks"
INSTALL_DIR="/usr/local/bin"
LIB_DIR="/opt/keys.justworks"                  # backup script + extension artifacts
STATE_DIR="/var/lib/keys-justworks-server"     # the sqlite db lives here
BACKUP_DIR="/var/backups/keys-justworks"
VERSION="${VERSION:-latest}"

[ "$(id -u)" -eq 0 ] || { echo "run as root (use: ... | sudo bash)" >&2; exit 1; }

case "$(uname -m)" in
  x86_64)        target="x86_64-unknown-linux-gnu" ;;
  aarch64|arm64) target="aarch64-unknown-linux-gnu" ;;
  *) echo "unsupported arch: $(uname -m) (need x86_64 or aarch64)" >&2; exit 1 ;;
esac

if [ "$VERSION" = "latest" ]; then
  # `releases/latest` resolves by DATE, not tag/semver: whenever an ext-v*
  # release is the newest overall, it IS "latest" — and carries no server
  # binary. Resolve the newest server tag (v*) via the API instead.
  # (Unauthenticated API = 60 req/h; a deploy one-shot never feels that.)
  VERSION=$(curl -fsSL "https://api.github.com/repos/$OWNER_REPO/releases?per_page=100" \
    | grep -oE '"tag_name": *"v[0-9.]+"' | head -1 | grep -oE 'v[0-9.]+')
  [ -n "$VERSION" ] || { echo "error: no server (v*) release found for $OWNER_REPO" >&2; exit 1; }
fi
base="https://github.com/$OWNER_REPO/releases/download/$VERSION"
# scripts are pinned to the same tag as the binary — they can't drift apart.
raw="https://raw.githubusercontent.com/$OWNER_REPO/$VERSION"
asset="$BIN_NAME-$target.tar.gz"

# --- binary: download + sha256-verify + atomic swap ---
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
echo "downloading $asset ($VERSION)..."
curl -fsSL "$base/$asset"        -o "$tmp/$asset"
curl -fsSL "$base/$asset.sha256" -o "$tmp/$asset.sha256"
( cd "$tmp" && sha256sum -c "$asset.sha256" >/dev/null && echo "checksum ok" )
tar -xzf "$tmp/$asset" -C "$tmp"
install -m 0755 "$tmp/$BIN_NAME" "$INSTALL_DIR/.${BIN_NAME}.new"
mv -f "$INSTALL_DIR/.${BIN_NAME}.new" "$INSTALL_DIR/$BIN_NAME"   # rename over a running binary is safe

# --- dedicated system user: a fixed uid gives a predictable /var/lib path that
#     backups and debugging can rely on (DynamicUser hides state under /var/lib/private) ---
getent group "$USER_NAME" >/dev/null || groupadd --system "$USER_NAME"
getent passwd "$USER_NAME" >/dev/null || useradd --system --gid "$USER_NAME" \
  --no-create-home --shell /usr/sbin/nologin "$USER_NAME"

# --- hardened systemd unit ----------------------------------------------------
# Extension hosting (KJ_EXTENSION_DIR) is opt-in: it only makes sense for the
# official provider (the signed .crx's update_url is baked to
# keys.justworks.cash; a self-built one is differently-signed). HOST_EXTENSION
#   1 -> host /extension/*       unset -> keep whatever the existing unit has
#   0 -> explicitly stop hosting (on a fresh install, unset == not hosted)
unit=/etc/systemd/system/keys-justworks-server.service
case "${HOST_EXTENSION:-}" in
  1) ext_env="Environment=KJ_EXTENSION_DIR=$LIB_DIR/extension" ;;
  0) ext_env="" ;;
  *) if [ -f "$unit" ] && grep -q '^Environment=KJ_EXTENSION_DIR=' "$unit"; then
       ext_env="Environment=KJ_EXTENSION_DIR=$LIB_DIR/extension"  # preserve
     else
       ext_env=""
     fi ;;
esac
ext_line="${ext_env:-# /extension/* not hosted (enable: ... | sudo env HOST_EXTENSION=1 bash)}"

cat > "$unit" <<UNIT
[Unit]
Description=keys.justworks server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER_NAME
Group=$USER_NAME
StateDirectory=keys-justworks-server
WorkingDirectory=$STATE_DIR
Environment=DATABASE_URL=sqlite:keys.db
Environment=LISTEN_ADDR=127.0.0.1:3000
Environment=RUST_LOG=info
$ext_line
ExecStart=$INSTALL_DIR/$BIN_NAME
Restart=on-failure
RestartSec=2

NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictNamespaces=yes
RestrictAddressFamilies=AF_INET AF_INET6
LockPersonality=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
CapabilityBoundingSet=
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable keys-justworks-server >/dev/null
systemctl restart keys-justworks-server

# --- backups: ensure sqlite3, install the script, hourly cron ---
if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "installing sqlite3 (backup tool)..."
  apt-get update -qq && apt-get install -y -qq sqlite3
fi
mkdir -p "$LIB_DIR"
curl -fsSL "$raw/scripts/backup.sh" -o "$LIB_DIR/backup.sh"
chmod 0755 "$LIB_DIR/backup.sh"
cat > /etc/cron.d/keys-justworks-backup <<CRON
# hourly online backup of the keys.justworks sqlite store (keep 168 ~= a week)
5 * * * * root DATABASE_URL=sqlite:$STATE_DIR/keys.db BACKUP_DIR=$BACKUP_DIR BACKUP_KEEP=168 $LIB_DIR/backup.sh >> /var/log/keys-justworks-backup.log 2>&1
CRON
chmod 0644 /etc/cron.d/keys-justworks-backup

# --- extension artifacts: newest ext-v* release -> served at /extension/ ----
# Only when hosting (see ext_env above). Auto-update + the /download page
# read these. The extension release stream is independent of the server pin,
# so this always takes the newest ext-v* (pin with EXT_VERSION=ext-vX.Y.Z).
# A failure must not abort a server upgrade (which may carry important fixes);
# /extension/* just 404s — by design — until the next run succeeds.
if [ -n "$ext_env" ]; then
  EXT_DIR="$LIB_DIR/extension"
  mkdir -p "$EXT_DIR"
  if curl -fsSL "$raw/scripts/sync-extension.sh" | bash -s -- "$EXT_DIR" "${EXT_VERSION:-}"; then
    :
  else
    echo "WARN: extension artifact sync failed — /extension/* will 404 until the next setup run"
  fi
fi

echo
echo "installed $BIN_NAME ($VERSION) -> listening on 127.0.0.1:3000"
echo "db:       $STATE_DIR/keys.db (user: $USER_NAME)"
echo "status:   systemctl status keys-justworks-server"
echo "logs:     journalctl -u keys-justworks-server -f"
echo "backups:  hourly -> $BACKUP_DIR (keep ~168); log: /var/log/keys-justworks-backup.log"
if [ -n "$ext_env" ]; then
  echo "extension: $LIB_DIR/extension (served at /extension/*; auto-update + /download)"
else
  echo "extension: not hosted (/extension/* 404s; enable: ... | sudo env HOST_EXTENSION=1 bash)"
fi
echo
echo "next — terminate TLS with a reverse proxy. Caddy:"
echo "    keys.example.com { reverse_proxy 127.0.0.1:3000 }"
