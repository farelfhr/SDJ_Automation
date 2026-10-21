import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createPublicProxy } from './public-proxy.mjs';

const values = parseEnv(readFileSync('.env', 'utf8'));
const publicUrl = new URL(values.PUBLIC_BASE_URL);
if (
  publicUrl.protocol !== 'https:' ||
  publicUrl.pathname !== '/' ||
  publicUrl.search ||
  publicUrl.hash ||
  publicUrl.username ||
  publicUrl.password
)
  throw new Error('PUBLIC_BASE_URL_REQUIRES_HTTPS_ORIGIN');
if (!values.NGROK_AUTHTOKEN) throw new Error('NGROK_AUTHTOKEN_REQUIRED_IN_MAIN_ENV');
const executable = resolve('.local/ngrok/ngrok.exe');
if (!existsSync(executable)) throw new Error('NGROK_MISSING: lihat docs/runbooks/public-access.md');
const apiPort = Number(values.API_PORT ?? 3000);
const proxyPort = Number(values.PUBLIC_PROXY_PORT ?? 3001);
for (const port of [apiPort, proxyPort])
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT_INVALID');
if (apiPort === proxyPort) throw new Error('PUBLIC_PROXY_MUST_USE_SEPARATE_PORT');
const health = await fetch(`http://127.0.0.1:${apiPort}/health/ready`, {
  signal: AbortSignal.timeout(10_000),
});
if (!health.ok) throw new Error('MAIN_API_NOT_READY');
const proxy = createPublicProxy(apiPort);
await new Promise((accept, reject) => {
  proxy.once('error', reject);
  proxy.listen(proxyPort, '127.0.0.1', accept);
});
const child = spawn(
  executable,
  [
    'http',
    `http://127.0.0.1:${proxyPort}`,
    '--url',
    publicUrl.origin,
    '--inspect=false',
    '--log=false',
  ],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, NGROK_AUTHTOKEN: values.NGROK_AUTHTOKEN },
  }
);
console.log(`Halaman penghubungan: ${publicUrl.origin}. Menunggu koneksi ngrok…`);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  child.kill();
  proxy.close();
  proxy.closeAllConnections();
  process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
child.on('exit', (code) => stop(code ?? 1));
child.on('error', () => {
  console.error('NGROK_START_FAILED');
  stop(1);
});
