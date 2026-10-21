import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

// Secrets are exported separately from the source archive into an ignored local directory.
const output = resolve('.local/deployment/vps');
mkdirSync(output, { recursive: true, mode: 0o700 });
const values = parseEnv(readFileSync('.env', 'utf8'));
const backendKeys = [
  'DATABASE_URL_APP',
  'DATABASE_URL_INGRESS',
  'DATABASE_URL_SCHEDULER',
  'ENCRYPTION_KEY',
  'LOOKUP_HMAC_KEY',
  'CHANNEL_HMAC_KEY',
  'CHANNEL_KEY_ID',
  'CHANNEL_ACCOUNT_ID',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_PICKER_API_KEY',
  'GOOGLE_APP_ID',
  'AI_LIVE_ENABLED',
  'SHEETS_LIVE_ENABLED',
  'GROQ_API_KEY',
  'GROQ_MODEL_V2',
  'GROQ_QUOTA_OWNER',
  'GROQ_LOCAL_RPM',
  'GROQ_LOCAL_RPD',
  'GEMINI_API_KEY',
  'GEMINI_MODEL_V2',
  'GEMINI_QUOTA_OWNER',
  'GEMINI_LOCAL_RPM',
  'GEMINI_LOCAL_RPD',
  'NVIDIA_API_KEY',
  'GLM_API_KEY',
  'NVIDIA_MODEL',
  'NVIDIA_QUOTA_OWNER',
  'NVIDIA_LOCAL_RPM',
  'NVIDIA_LOCAL_RPD',
];
function exportEnv(filename, keys, overrides = {}) {
  const entries = Object.fromEntries(
    keys.filter((key) => values[key] !== undefined).map((key) => [key, values[key]])
  );
  Object.assign(entries, overrides);
  const content =
    Object.entries(entries)
      .map(([key, value]) => {
        if (/[\r\n\0]/.test(value)) throw new Error('MULTILINE_DEPLOYMENT_SECRET_UNSUPPORTED');
        return `${key}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      })
      .join('\n') + '\n';
  writeFileSync(resolve(output, filename), content, { mode: 0o600 });
}
exportEnv('backend.env', backendKeys, {
  NODE_ENV: 'production',
  API_HOST: '127.0.0.1',
  API_PORT: '3000',
  PUBLIC_BASE_URL: 'https://app.sdj-rumah-kepemimpinan.my.id',
});
exportEnv('maintenance.env', ['DATABASE_URL_MAINTENANCE']);
exportEnv('gateway.env', ['CHANNEL_HMAC_KEY', 'CHANNEL_KEY_ID', 'CHANNEL_ACCOUNT_ID'], {
  API_PORT: '3000',
});
for (const filename of ['package.json', 'package-lock.json']) {
  copyFileSync(resolve('deploy/openclaw', filename), resolve(output, 'openclaw-' + filename));
}
process.stdout.write(
  'VPS configuration exported to ignored .local/deployment/vps (secret values omitted).\n'
);
