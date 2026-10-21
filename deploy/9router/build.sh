#!/usr/bin/env bash
set -euo pipefail
export PATH=/opt/sdj/node/bin:/usr/bin:/bin
export NODE_OPTIONS='--max-old-space-size=384 --max-semi-space-size=8'
export NEXT_TELEMETRY_DISABLED=1
export NODE_ENV=production
export UV_THREADPOOL_SIZE=1
export MAKEFLAGS=-j1
export npm_config_jobs=1
export DATA_DIR=/var/lib/9router/staging
export NEXT_PUBLIC_BASE_URL=http://127.0.0.1:20128
export BASE_URL=http://127.0.0.1:20128
export ENABLE_REQUEST_LOGS=false
export REQUIRE_API_KEY=true
cd /opt/9router/releases/87a74e1bda3677193c6f71a7e2100c90311f0689
printf 'dependencies\n' > /var/lib/9router/staging/build-phase
# Upstream does not include a lock. Generate it once, without running install hooks,
# then use that resolved lock for the actual reproducible dependency installation.
if ! test -f package-lock.json; then
 npm install --package-lock-only --include=dev --ignore-scripts --no-audit --no-fund
fi
sha256sum package-lock.json > /var/lib/9router/staging/package-lock.sha256
npm ci --include=dev --ignore-scripts --no-audit --no-fund
printf 'compile\n' > /var/lib/9router/staging/build-phase
npm run build
test -f .next/standalone/server.js
printf 'passed\n' > /var/lib/9router/staging/build-phase
printf 'NINEROUTER_BUILD_PASSED\n'
