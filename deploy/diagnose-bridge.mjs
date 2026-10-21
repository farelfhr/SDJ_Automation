import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(process.env.OPENCLAW_STATE_DIR + '/openclaw.json', 'utf8'));
console.log(
  JSON.stringify({
    enabled: config.plugins?.enabled,
    allow: config.plugins?.allow,
    bridgeEnabled: config.plugins?.entries?.['sdj-bridge']?.enabled,
    bridgeHooks: config.plugins?.entries?.['sdj-bridge']?.hooks,
    loadPaths: config.plugins?.load?.paths,
  })
);
const output = execFileSync(
  '/opt/sdj/node/bin/node',
  ['scripts/openclaw.mjs', 'plugins', 'inspect', 'sdj-bridge', '--runtime', '--json'],
  {
    encoding: 'utf8',
    timeout: 60000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);
const result = JSON.parse(output.slice(output.indexOf('{')));
console.log(
  JSON.stringify({
    bridge: {
      id: result.plugin?.id,
      enabled: result.plugin?.enabled,
      status: result.plugin?.status,
      error: result.plugin?.error,
    },
    typedHooks: result.typedHooks,
    services: result.services,
    policy: result.policy,
    diagnostics: result.diagnostics,
  })
);
