#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0
release_id=${1:?release identifier required}
[[ "$release_id" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]
release="/opt/sdj/releases/$release_id"
test -f "$release/apps/api/dist/index.js"
test -f /opt/sdj/shared/openclaw/node_modules/openclaw/openclaw.mjs
install -m 0640 -o root -g sdj /root/backend.env /etc/sdj/backend.env
install -m 0640 -o root -g sdj /root/maintenance.env /etc/sdj/maintenance.env
install -m 0640 -o root -g sdj-gateway /root/gateway.env /etc/sdj/gateway.env
install -m 0644 "$release"/deploy/*.service "$release"/deploy/*.timer /etc/systemd/system/
chmod -R a+rX,go-w "$release" /opt/sdj/shared/openclaw
ln -sfn "$release" /opt/sdj/current
restorecon -RF /opt/sdj /etc/sdj /var/lib/sdj /var/lib/sdj-gateway
systemctl daemon-reload
systemctl enable --now sdj-api sdj-public sdj-worker sdj-maintenance.timer
printf 'SDJ_RELEASE_READY %s\n' "$release_id"
