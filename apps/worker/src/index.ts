/**
 * SDJ Assistant Background Worker
 *
 * Handles background jobs: message delivery, reconciliation, etc.
 */

import { getConfig } from '@sdj/config';
import { getPool, query } from '@sdj/infrastructure';
import { WhatsAppChannelGateway } from '@sdj/infrastructure';

interface Job {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  max_attempts: number;
  attempts: number;
  last_error: string | null;
  run_at: Date;
  leased_until: Date | null;
  leased_by: string | null;
}

const WORKER_ID = `worker-${process.pid}`;

async function main() {
  const config = getConfig();

  const logger = {
    info: (msg: string, meta?: Record<string, unknown>) => {
      console.log(`[${new Date().toISOString()}] [INFO] ${msg}`, meta ?? '');
    },
    error: (msg: string, meta?: Record<string, unknown>) => {
      console.error(`[${new Date().toISOString()}] [ERROR] ${msg}`, meta ?? '');
    },
    warn: (msg: string, meta?: Record<string, unknown>) => {
      console.warn(`[${new Date().toISOString()}] [WARN] ${msg}`, meta ?? '');
    },
  };

  // Initialize channel gateway
  const channelGateway = new WhatsAppChannelGateway({
    webhookSecret: config.openclaw.webhookSecret,
    apiKey: config.openclaw.apiKey,
    instanceId: config.openclaw.instanceId,
  });

  logger.info('Worker starting', { workerId: WORKER_ID });

  // Main polling loop
  const pollInterval = config.worker.pollIntervalMs;

  async function poll() {
    try {
      await processJobs();
    } catch (error) {
      logger.error('Poll error', { error: String(error) });
    }

    // Schedule next poll
    setTimeout(poll, pollInterval);
  }

  // Start polling
  poll();

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, shutting down...`);
      process.exit(0);
    });
  }
}

async function processJobs() {
  const pool = getPool();

  // Claim pending jobs
  const result = await pool.query<Job>(`
    UPDATE jobs
    SET status = 'processing',
        attempts = attempts + 1,
        started_at = NOW(),
        leased_until = NOW() + INTERVAL '5 minutes',
        leased_by = $1
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pending'
        AND run_at <= NOW()
        AND (leased_until IS NULL OR leased_until < NOW())
        AND attempts < max_attempts
      ORDER BY priority DESC, run_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `, [WORKER_ID]);

  const job = result.rows[0];
  if (!job) {
    return; // No jobs to process
  }

  console.log(`Processing job: ${job.name} (${job.id})`);

  try {
    // Execute job based on name
    switch (job.name) {
      case 'deliver_message':
        await handleDeliverMessage(job);
        break;
      case 'reconcile_tracker':
        await handleReconcileTracker(job);
        break;
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }

    // Mark as completed
    await pool.query(`
      UPDATE jobs
      SET status = 'completed',
          completed_at = NOW(),
          leased_until = NULL,
          leased_by = NULL
      WHERE id = $1
    `, [job.id]);

    console.log(`Job completed: ${job.name} (${job.id})`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Job failed: ${job.name} (${job.id})`, { error: errorMessage });

    // Check if should retry
    if (job.attempts + 1 >= job.max_attempts) {
      // Mark as failed
      await pool.query(`
        UPDATE jobs
        SET status = 'failed',
            last_error = $2,
            leased_until = NULL,
            leased_by = NULL
        WHERE id = $1
      `, [job.id, errorMessage]);
    } else {
      // Put back to pending with backoff
      const backoffMs = Math.min(60000, 1000 * Math.pow(2, job.attempts));
      await pool.query(`
        UPDATE jobs
        SET status = 'pending',
            last_error = $2,
            run_at = NOW() + INTERVAL '1 millisecond' * $3,
            leased_until = NULL,
            leased_by = NULL
        WHERE id = $1
      `, [job.id, errorMessage, backoffMs]);
    }
  }
}

async function handleDeliverMessage(job: Job) {
  const payload = job.payload as {
    deliveryId: string;
    recipientId: string;
    content: string;
    priority: 'low' | 'normal' | 'high';
  };

  // Send via channel gateway
  const messageId = await channelGateway.send({
    userId: payload.recipientId,
    content: payload.content,
    priority: payload.priority,
  });

  console.log(`Message delivered: ${messageId}`);

  // Update delivery record
  const pool = getPool();
  await pool.query(`
    UPDATE deliveries
    SET status = 'sent',
        sent_at = NOW(),
        external_message_id = $2
    WHERE id = $1
  `, [payload.deliveryId, messageId]);
}

async function handleReconcileTracker(job: Job) {
  const payload = job.payload as {
    userId: string;
    trackerConnectionId: string;
  };

  console.log(`Reconciling tracker for user: ${payload.userId}`);

  // TODO: Implement reconciliation logic
  // - Compare local mutations with Google Sheets
  // - Fix any discrepancies
  // - Log results

  console.log(`Reconciliation complete for user: ${payload.userId}`);
}

// Start worker
main().catch((error) => {
  console.error('Worker failed to start:', error);
  process.exit(1);
});
