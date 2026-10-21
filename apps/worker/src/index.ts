import { setTimeout as delay } from 'node:timers/promises';
import { createRuntime } from '@sdj/infrastructure';
import { DomainError } from '@sdj/domain';
async function main(): Promise<void> {
  const runtime = createRuntime(),
    controller = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => controller.abort());
  if (!(await runtime.store.health())) throw new Error('DATABASE_UNAVAILABLE');
  process.stdout.write('SDJ worker ready (primary environment).\n');
  let nextReminderScan = 0;
  try {
    while (!controller.signal.aborted) {
      if (runtime.config.remindersEnabled && Date.now() >= nextReminderScan) {
        nextReminderScan = Date.now() + 30000;
        try {
          await runtime.reminders.tick(new Date());
        } catch {
          process.stderr.write('REMINDER_SCAN_FAILED\n');
        }
      }
      const job = await runtime.store.claimJob('main-' + process.pid);
      if (!job) {
        await delay(1000, undefined, { signal: controller.signal }).catch(() => {});
        continue;
      }
      try {
        await runtime.store.withJob(job, async () => {
          const actor = await runtime.store.actorForJob(job);
          if (job.kind === 'process_message') await runtime.service.process(actor);
          else if (job.groupId) await runtime.service.reconcile(actor, job.groupId);
        });
        await runtime.store.completeJob(job);
      } catch (error) {
        const code = error instanceof DomainError ? error.code : 'WORKER_OPERATION_FAILED';
        await runtime.store.retryJob(
          job,
          code,
          Math.min(60000, 1000 * 2 ** Math.min(job.attempts, 5))
        );
        process.stderr.write(`Worker operation ${job.id}: ${code}\n`);
      }
    }
  } finally {
    await runtime.store.close();
  }
}
main().catch(() => {
  process.stderr.write('WORKER_START_FAILED: check configuration and database access.\n');
  process.exitCode = 1;
});
