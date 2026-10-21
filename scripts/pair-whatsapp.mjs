import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
const state = resolve('.local/openclaw-state');
process.env.OPENCLAW_STATE_DIR = state;
process.env.OPENCLAW_CONFIG_PATH = resolve(state, 'openclaw.json');
const values = parseEnv(await readFile('.env', 'utf8'));
const config = JSON.parse(
  (await readFile(process.env.OPENCLAW_CONFIG_PATH, 'utf8')).replace(/^\uFEFF/, '')
);
const { setRuntimeConfigSnapshot } =
  await import('../.local/openclaw/node_modules/openclaw/dist/plugin-sdk/runtime-config-snapshot.js');
setRuntimeConfigSnapshot(config);
const runtime = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
  exit: (code) => {
    throw new Error('RUNTIME_EXIT_' + code);
  },
};
try {
  const { loginWeb } =
    await import('../.local/openclaw/node_modules/@openclaw/whatsapp/dist/runtime-api.js');
  console.log('SDJ - Pairing WhatsApp utama. Pindai QR langsung dari terminal ini.');
  await loginWeb(false, undefined, runtime, values.CHANNEL_ACCOUNT_ID ?? 'sdj-main');
  await writeFile(
    '.local/whatsapp-pair-status.json',
    JSON.stringify({ connected: true, at: new Date().toISOString() })
  );
  console.log('Pairing tersimpan. Gateway SDJ dapat dijalankan.');
} catch (error) {
  await writeFile(
    '.local/whatsapp-pair-status.json',
    JSON.stringify({
      connected: false,
      at: new Date().toISOString(),
      code: error.code ?? error.name,
    })
  );
  console.error('PAIRING_FAILED:', String(error.message).slice(0, 240));
  process.exitCode = 1;
}
