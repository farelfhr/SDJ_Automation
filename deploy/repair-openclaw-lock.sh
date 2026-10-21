#!/usr/bin/env bash
set -euo pipefail
export PATH=/opt/sdj/node/bin:$PATH
cd /opt/sdj/shared/openclaw
node --input-type=module <<'NODE'
import fs from 'node:fs';
const manifest = JSON.parse(fs.readFileSync('package.json'));
manifest.dependencies.openclaw = '2026.10.3';
manifest.dependencies['@openclaw/whatsapp'] = '2026.10.3';
fs.writeFileSync('package.json', JSON.stringify(manifest, null, 2) + '\n');
const lock = JSON.parse(fs.readFileSync('package-lock.json'));
lock.packages[''].dependencies = manifest.dependencies;
fs.writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
NODE
# Complete missing transitive entries in the Windows lock without upgrading the gateway.
npm install --package-lock-only --ignore-scripts --legacy-peer-deps --no-audit --no-fund
npm ci --ignore-scripts --legacy-peer-deps --omit=dev --no-audit --no-fund
node --input-type=module <<'NODE'
import fs from 'node:fs';
for (const name of ['openclaw', '@openclaw/whatsapp']) {
  const version = JSON.parse(fs.readFileSync(`node_modules/${name}/package.json`)).version;
  if (version !== '2026.10.3') throw new Error('GATEWAY_VERSION_MISMATCH');
  console.log(`${name}: ${version}`);
}
NODE
