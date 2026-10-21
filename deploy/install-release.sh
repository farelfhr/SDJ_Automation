#!/usr/bin/env bash
set -euo pipefail
umask 022
test "$(id -u)" = 0
release_id=${1:?release identifier required}
[[ "$release_id" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]
release="/opt/sdj/releases/$release_id"
test ! -e "$release"
install -d -m 0755 "$release"
tar --no-same-permissions --no-same-owner -xzf /root/source.tar.gz -C "$release"
export PATH=/opt/sdj/node/bin:$PATH
export NODE_OPTIONS=--max-old-space-size=512
cd "$release"
pnpm install --frozen-lockfile --ignore-scripts --reporter=append-only
pnpm build

install -d -m 0755 /opt/sdj/shared/openclaw
install -m 0644 /root/openclaw-package.json /opt/sdj/shared/openclaw/package.json
install -m 0644 /root/openclaw-package-lock.json /opt/sdj/shared/openclaw/package-lock.json
if ! npm ci --prefix /opt/sdj/shared/openclaw --ignore-scripts --legacy-peer-deps --omit=dev --no-audit --no-fund; then
  bash "$release/deploy/repair-openclaw-lock.sh"
fi
# Complete the package's own lifecycle before the read-only systemd sandbox starts it.
node /opt/sdj/shared/openclaw/node_modules/openclaw/openclaw.mjs --version
node "$release/scripts/patch-whatsapp-ingress.mjs" /opt/sdj/shared/openclaw

# Gateway is activated separately after the local gateway is stopped and state is copied.
bash "$release/deploy/activate-release.sh" "$release_id"
