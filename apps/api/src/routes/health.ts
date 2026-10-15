/**
 * Health check routes
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { checkDatabaseHealth } from '@sdj/infrastructure';

export const healthRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Basic health check
  app.get('/', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  });

  // Detailed health check
  app.get('/ready', async (request, reply) => {
    const dbHealth = await checkDatabaseHealth();

    const checks = {
      database: dbHealth,
    };

    const allHealthy = Object.values(checks).every(c => c.status === 'ok');

    const response = {
      status: allHealthy ? 'healthy' : 'unhealthy',
      version: '1.0.0',
      uptime: process.uptime(),
      checks,
    };

    if (!allHealthy) {
      reply.status(503);
    }

    return response;
  });

  // Liveness probe
  app.get('/live', async () => {
    return { status: 'alive' };
  });
};
