import { createRuntime } from '@sdj/infrastructure';
import { createApp } from './app.js';
async function main(): Promise<void> {
  const runtime = createRuntime(),
    config = runtime.config;
  const app = createApp({
    store: runtime.store,
    onboarding: runtime.onboarding,
    channelKey: config.channelKey,
    channelKeyId: config.channelKeyId,
    channelAccountId: config.channelAccountId,
    publicBaseUrl: config.publicBaseUrl,
  });
  const stop = async () => {
    await app.close();
    await runtime.store.close();
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void stop().then(() => process.exit(0));
    });
  await app.listen({ host: config.host, port: config.port });
  process.stdout.write(`SDJ API listening at ${config.host}:${config.port}\n`);
}
main().catch(() => {
  process.stderr.write('API_START_FAILED: check configuration and database access.\n');
  process.exitCode = 1;
});
