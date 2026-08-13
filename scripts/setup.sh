#!/usr/bin/env bash
# keys.justworks — one-line installer / upgrader for the VPS.
#
#   curl -fsSL https://raw.githubusercontent.com/gzuuus/keys.justworks/main/scripts/setup.sh | sudo bash
#
# Downloads the release binary for this architecture, verifies its sha256,
# installs it under /usr/local/bin, writes a hardened systemd unit, and
# enables + (re)starts the service. Re-running upgrades in place (data in
# /var/lib/keys-justworks-server is preserved).
#
#   VERSION=v0.1.1 ... | sudo bash   # pin a release (default: latest)
#
# Does NOT configure TLS / reverse proxy — see the final message. Must be root.
set -euo pipefail

OWNER_REPO="gzuuus/keys.justworks"
BIN_NAME="keys-justworks-server"
INSTALL_DIR="/usr/local/bin"
STATE_DIR="/var/lib/keys-justworks-server"      # matches StateDirectory= in the unit
VERSION="${VERSION:-latest}"

[ "$(id -u)" -eq 0 ] || { echo "run as root (use: ... | sudo bash)" >&2; exit 1; }

case "$(uname -m)" in
  x86_64)        target="x86_64-unknown-linux-gnu" ;;
  aarch64|arm64) target="aarch64-unknown-linux-gnu" ;;
  *) echo "unsupported arch: $(uname -m) (need x86_64 or aarch64)" >&2; exit 1 ;;
esac

if [ "$VERSION" = "latest" ]; then
  base="https://github.com/$OWNER_REPO/releases/latest/download"
else
  base="https://github.com/$OWNER_REPO/releases/download/$VERSION"
fi
asset="$BIN_NAME-$target.tar.gz"

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
echo "downloading $asset ($VERSION)..."
curl -fsSL "$base/$asset"        -o "$tmp/$asset"
curl -fsSL "$base/$asset.sha256" -o "$tmp/$asset.sha256"
( cd "$tmp" && sha256sum -c "$asset.sha256" >/dev/null && echo "checksum ok" )

tar -xzf "$tmp/$asset" -C "$tmp"

# atomic swap: rename over a running binary is fine (truncate isn't — ETXTBSY)
install -m 0755 "$tmp/$BIN_NAME" "$INSTALL_DIR/.${BIN_NAME}.new"
mv -f "$INSTALL_DIR/.${BIN_NAME}.new" "$INSTALL_DIR/$BIN_NAME"

cat > /etc/systemd/system/keys-justworks-server.service <<'UNIT'
[Unit]
Description=keys.justworks server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
DynamicUser=yes
StateDirectory=keys-justworks-server
WorkingDirectory=/var/lib/keys-justworks-server
Environment=DATABASE_URL=sqlite:keys.db
Environment=LISTEN_ADDR=127.0.0.1:3000
Environment=RUST_LOG=info
ExecStart=/usr/local/bin/keys-justworks-server
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

echo
echo "installed $BIN_NAME ($VERSION) -> listening on 127.0.0.1:3000"
echo "db:     $STATE_DIR/keys.db"
echo "status: systemctl status keys-justworks-server"
echo "logs:   journalctl -u keys-justworks-server -f"
echo
echo "next — terminate TLS with a reverse proxy. Caddy:"
echo "    keys.example.com { reverse_proxy 127.0.0.1:3000 }"
echo "backups — cron scripts/backup.sh with DATABASE_URL=sqlite:$STATE_DIR/keys.db"
