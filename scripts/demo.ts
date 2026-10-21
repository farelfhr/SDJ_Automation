import { CommandService } from '@sdj/application';
import {
  MemoryStore,
  FakeClock,
  FakeTrackerGateway,
  FakeInterpreter,
  FakeOnboarding,
  syntheticEvent,
} from '@sdj/testing';
async function main(): Promise<void> {
  const clock = new FakeClock(),
    store = new MemoryStore(clock);
  const service = new CommandService(
    store,
    new FakeTrackerGateway(),
    new FakeInterpreter(),
    new FakeOnboarding(),
    clock
  );
  const first = await store.ingest(syntheticEvent('bantuan', 'synthetic-demo', clock), clock.now());
  await service.process(first.actor);
  process.stdout.write(
    'Perintah bantuan sintetis diproses tanpa layanan eksternal:\n' +
      store.responses(first.actor).join('\n') +
      '\n'
  );
}
main().catch(() => {
  process.stderr.write('DEMO_FAILED\n');
  process.exitCode = 1;
});
