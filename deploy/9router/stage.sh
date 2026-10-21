#!/usr/bin/env bash
set -euo pipefail
umask 022
export PATH=/opt/sdj/node/bin:/usr/sbin:/usr/bin:/sbin:/bin
source_archive=/root/9router-upstream-87a74e1.tar.gz
expected=19ef5a68603672c8efe9b140e917fcd71a0b28be930600e2bbfa914819f1ea27
test "$(sha256sum "$source_archive" | cut -d' ' -f1)" = "$expected"
test "$(readlink -f /opt/sdj/current)" = /opt/sdj/releases/20261019T062833Z
test ! -e /opt/9router/releases/87a74e1bda3677193c6f71a7e2100c90311f0689
checkpoint="/root/sdj-before-9router-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 "$checkpoint"
cp -p /etc/sdj/backend.env "$checkpoint/backend.env"
cp -p /etc/caddy/Caddyfile "$checkpoint/Caddyfile"
chmod 0600 "$checkpoint/backend.env" "$checkpoint/Caddyfile"
readlink -f /opt/sdj/current > "$checkpoint/previous-release"
systemctl show sdj-api sdj-worker sdj-public sdj-gateway -p Id -p MainPID -p ActiveEnterTimestamp -p NRestarts > "$checkpoint/services-before"
if ! id ninerouter >/dev/null 2>&1; then
 useradd --system --home-dir /var/lib/9router --create-home --shell /sbin/nologin ninerouter
fi
install -d -m 0755 /opt/9router/tools /opt/9router/releases
install -d -m 0750 -o ninerouter -g ninerouter /var/lib/9router /var/lib/9router/staging
release=/opt/9router/releases/87a74e1bda3677193c6f71a7e2100c90311f0689
install -d -m 0755 "$release"
tar --no-same-owner --no-same-permissions --strip-components=1 -xzf "$source_archive" -C "$release"
tar --no-same-owner --no-same-permissions -xzf /root/sdj-9router-tools.tar.gz -C /opt/9router/tools --strip-components=2
cd "$release"
node /opt/9router/tools/0001-bounded-build.mjs
chown -R ninerouter:ninerouter "$release"
install -m 0644 /opt/9router/tools/sdj-9router-build.service /etc/systemd/system/sdj-9router-build.service
restorecon -RF /opt/9router /var/lib/9router /etc/systemd/system/sdj-9router-build.service
systemctl daemon-reload
printf 'prepared\n' > /var/lib/9router/staging/build-phase
chown ninerouter:ninerouter /var/lib/9router/staging/build-phase
printf 'NINEROUTER_STAGING_PREPARED %s\n' "$checkpoint"
printf 'Run: python3 /opt/9router/tools/monitor.py --start\n'
