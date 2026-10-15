/**
 * SDJ Assistant API Server
 *
 * Main entry point for the Fastify API server.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

import { getConfig } from '@sdj/config';
import { checkDatabaseHealth } from '@sdj/infrastructure';
import { healthRoutes } from './routes/health.js';
import { webhookRoutes } from './routes/webhook.js';
import { userRoutes } from './routes/user.js';

async function main() {
  const config = getConfig();

  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport: config.nodeEnv === 'development' ? {
        target: 'pino-pretty',
        options: { colorize: true },
      } : undefined,
    },
  });

  // Register plugins
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Register routes
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(webhookRoutes, { prefix: '/webhook' });
  await app.register(userRoutes, { prefix: '/api/v1/users' });

  // Root route
  app.get('/', async () => {
    return {
      name: 'SDJ Assistant API',
      version: '1.0.0',
      status: 'running',
    };
  });

  // Start server
  try {
    const address = await app.listen({
      host: config.api.host,
      port: config.api.port,
    });
    app.log.info(`Server listening at ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down...`);
      await app.close();
      process.exit(0);
    });
  }
}

main();
