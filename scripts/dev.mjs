import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const bundled = resolve('.local/runtime/node_modules/node/bin/node.exe');
const executable = existsSync(bundled) ? bundled : process.execPath;
const children = ['api', 'worker'].map((name) =>
  spawn(
    executable,
    [
      '--use-env-proxy',
      '--use-system-ca',
      '--conditions=development',
      '--import',
      'tsx',
      `apps/${name}/src/index.ts`,
    ],
    { stdio: 'inherit', windowsHide: true }
  )
);
children.push(
  spawn(
    executable,
    ['--conditions=development', '--import', 'tsx', 'scripts/maintenance.ts', '--watch'],
    { stdio: 'inherit', windowsHide: true }
  )
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => {
    if (!stopping) stop(code || 1);
  });
}
