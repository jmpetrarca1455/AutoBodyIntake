import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import { config } from './config/index.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { shopRoutes } from './modules/shops/shop.routes.js';
import { intakeRoutes } from './modules/intake/intake.routes.js';

/**
 * Builds and configures the Fastify application instance.
 * Kept separate from server bootstrap so it can be reused in tests.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' } }
          : undefined,
    },
    // Trust proxy so we get correct client IPs behind Fly.io/Render/Nginx.
    trustProxy: true,
  });

  // ── Core plugins ──────────────────────────────────────
  await app.register(sensible);

  // Tolerate empty bodies on JSON POSTs (e.g. action endpoints like finalize
  // that carry no payload) instead of 400-ing on "empty JSON body".
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      const text = (body as string).trim();
      if (text.length === 0) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(text));
      } catch (err) {
        (err as { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    },
  );
  await app.register(cors, {
    origin: true, // TODO: lock to known app origins before production launch.
  });
  await app.register(multipart, {
    limits: {
      fileSize: config.MAX_UPLOAD_MB * 1024 * 1024,
    },
  });

  // ── Routes ────────────────────────────────────────────
  await app.register(healthRoutes);

  // API v1 namespace — feature modules register here as we build them.
  await app.register(
    async (v1) => {
      v1.get('/', async () => ({ message: 'AutoBody Intake API v1', status: 'ok' }));
      await v1.register(shopRoutes);
      await v1.register(intakeRoutes);
    },
    { prefix: '/v1' },
  );

  return app;
}

