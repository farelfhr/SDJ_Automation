import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const child = spawn(
  resolve('.local/runtime/node_modules/node/bin/node.exe'),
  ['--use-env-proxy', '--use-system-ca', 'scripts/pair-whatsapp.mjs'],
  { stdio: 'inherit', windowsHide: true }
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => {
  process.stderr.write('PAIR_RUNTIME_UNAVAILABLE\n');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
