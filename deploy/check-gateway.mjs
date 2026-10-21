import { execFileSync } from 'node:child_process';

try {
  const output = execFileSync(
    '/opt/sdj/node/bin/node',
    ['scripts/openclaw.mjs', 'channels', 'status', '--json', '--timeout', '15000'],
    { encoding: 'utf8', timeout: 45000, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const start = output.indexOf('{');
  const status = JSON.parse(output.slice(start));
  const channels = status.channelAccounts?.whatsapp ?? [];
  const summarize = (value) =>
    Object.fromEntries(
      ['enabled', 'configured', 'linked', 'running', 'connected'].map((key) => [
        key,
        value[key] ?? null,
      ])
    );
  console.log(
    JSON.stringify({
      whatsapp: summarize(status.channels?.whatsapp ?? {}),
      accounts: channels.map(summarize),
    })
  );
  if (channels.length === 0 || channels.some((channel) => !channel.running || !channel.connected))
    process.exitCode = 1;
} catch (error) {
  console.log(
    JSON.stringify({
      gatewayCheck: 'failed',
      code: error.code ?? error.status ?? 'STATUS_UNAVAILABLE',
    })
  );
  process.exitCode = 1;
}
