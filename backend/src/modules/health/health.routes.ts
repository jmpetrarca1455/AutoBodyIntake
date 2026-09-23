import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { storageDriver, emailDriver, aiDriver, smsDriver } from '../../config/index.js';

/**
 * Health & readiness endpoints.
 * Used by load balancers / uptime checks and to confirm the API is live.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'autobody-intake-backend',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  }));

  app.get('/health/ready', async (_request, reply) => {
    let database = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'unreachable';
    }

    const status = database === 'ok' ? 'ready' : 'degraded';
    return reply.code(status === 'ready' ? 200 : 503).send({
      status,
      checks: {
        database,
        storage: `ok (${storageDriver})`,
        email: `ok (${emailDriver})`,
        sms: `ok (${smsDriver})`,
        ai: `ok (${aiDriver})`,
      },
    });
  });
}

