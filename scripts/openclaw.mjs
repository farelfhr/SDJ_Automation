import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { ensureWhatsAppIngressPatch } from './patch-whatsapp-ingress.mjs';
import {
  enablePublicWhatsAppDM,
  enableSdjBridgeHooks,
  assertSdjBridgeLoaded,
} from './openclaw-config.mjs';

const values = parseEnv(readFileSync(process.env.SDJ_ENV_FILE ?? '.env', 'utf8'));
// The public tunnel only exposes onboarding; channel ingress/outbox stay on loopback.
const internalApiBaseUrl = `http://127.0.0.1:${values.API_PORT ?? 3000}`;
const state = resolve(process.env.OPENCLAW_STATE_DIR ?? '.local/openclaw-state'),
  configPath = resolve(state, 'openclaw.json');
const bundledNode = resolve('.local/runtime/node_modules/node/bin/node.exe');
const executable =
  process.platform === 'win32' && existsSync(bundledNode) ? bundledNode : process.execPath;
const openclawHome = resolve(process.env.SDJ_OPENCLAW_HOME ?? '.local/openclaw');
const cli = resolve(openclawHome, 'node_modules/openclaw/openclaw.mjs');
if (!existsSync(executable) || !existsSync(cli))
  throw new Error('OPENCLAW_RUNTIME_MISSING: lihat docs/runbooks/operations.md');
mkdirSync(state, { recursive: true });
if (!existsSync(configPath)) {
  const account = values.CHANNEL_ACCOUNT_ID;
  if (!account) throw new Error('CHANNEL_ACCOUNT_ID_REQUIRED');
  const config = {
    gateway: {
      mode: 'local',
      bind: 'loopback',
      port: 18789,
      auth: { mode: 'token', token: randomBytes(32).toString('hex') },
      controlUi: { enabled: false },
    },
    session: { dmScope: 'per-account-channel-peer' },
    agents: { defaults: { heartbeat: { every: '0m' } } },
    cron: { enabled: false },
    tools: { deny: ['*'] },
    logging: { level: 'error', consoleLevel: 'error' },
    plugins: {
      allow: ['sdj-bridge', 'whatsapp'],
      load: {
        paths: [
          resolve('packages/openclaw-bridge'),
          resolve(openclawHome, 'node_modules/@openclaw/whatsapp'),
        ],
      },
      entries: {
        'sdj-bridge': {
          enabled: true,
          config: {
            apiBaseUrl: internalApiBaseUrl,
            accountId: account,
            keyId: values.CHANNEL_KEY_ID ?? 'main-v1',
            keyEnv: 'SDJ_BRIDGE_HMAC',
            pollIntervalMs: 2000,
          },
        },
        whatsapp: { enabled: true },
      },
    },
    channels: {
      whatsapp: {
        dmPolicy: 'open',
        allowFrom: ['*'],
        groupPolicy: 'disabled',
        selfChatMode: false,
        historyLimit: 0,
        accounts: { [account]: { enabled: true } },
      },
    },
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}
// Migrate the existing main configuration as well as fresh installations.
const currentConfig = readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
const config = enableSdjBridgeHooks(
  enablePublicWhatsAppDM(JSON.parse(currentConfig), values.CHANNEL_ACCOUNT_ID)
);
config.plugins.entries['sdj-bridge'].config.apiBaseUrl = internalApiBaseUrl;
// Absolute plugin paths must follow the release when state moves from Windows to Linux.
config.plugins.load = {
  paths: [
    resolve('packages/openclaw-bridge'),
    resolve(openclawHome, 'node_modules/@openclaw/whatsapp'),
  ],
};
const configured = JSON.stringify(config, null, 2);
if (configured !== currentConfig) writeFileSync(configPath, configured);
// Only the channel credential is handed to the gateway. Google, database and AI keys stay in the backend.
const childEnv = {
  ...process.env,
  OPENCLAW_STATE_DIR: state,
  OPENCLAW_CONFIG_PATH: configPath,
  SDJ_BRIDGE_HMAC: values.CHANNEL_HMAC_KEY ?? '',
};
if (process.argv[2] === 'gateway' && process.argv[3] === 'run') {
  // Production dependencies are root-owned; deployment installs the patch before
  // this read-only verification. Local development may apply it on first start.
  ensureWhatsAppIngressPatch(openclawHome, { check: process.env.NODE_ENV === 'production' });
  try {
    const output = execFileSync(
      executable,
      [
        '--use-env-proxy',
        '--use-system-ca',
        cli,
        'plugins',
        'inspect',
        'sdj-bridge',
        '--runtime',
        '--json',
      ],
      {
        env: childEnv,
        encoding: 'utf8',
        timeout: 60_000,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      }
    );
    assertSdjBridgeLoaded(JSON.parse(output.slice(output.indexOf('{'))));
    process.stdout.write('SDJ_BRIDGE_PREFLIGHT_READY\n');
  } catch {
    process.stderr.write(
      'SDJ_BRIDGE_STARTUP_FAILED: bridge must load with its message hook and outbox.\n'
    );
    process.exit(1);
  }
}
const child = spawn(
  executable,
  ['--use-env-proxy', '--use-system-ca', cli, ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: childEnv,
  }
);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
child.on('error', () => {
  process.stderr.write('OPENCLAW_START_FAILED\n');
  process.exitCode = 1;
});
