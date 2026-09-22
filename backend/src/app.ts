import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import autoload from '@fastify/autoload';
import { config } from './config/index.js';
import { moduleRegistry } from './modules/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Builds and configures the Fastify application instance.
 * Kept separate from server bootstrap so it can be reused in tests.
 *
 * Architecture:
 *   - Cross-cutting concerns (CORS, multipart, rate-limit, error handling)
 *     live in src/plugins/ and are AUTOLOADED - drop a file in, it's wired.
 *   - Feature routes are registered from src/modules/index.ts (the module
 *     registry) - add a module there, app.ts never changes.
 * This keeps growth additive instead of requiring edits to this file.
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

  // Cross-cutting plugins (autoloaded, ordered by filename prefix: 10-, 20-, ...)
  await app.register(autoload, {
    dir: path.join(__dirname, 'plugins'),
  });

  // Feature routes (see src/modules/index.ts to add more).
  for (const mod of moduleRegistry) {
    await app.register(mod.register, { prefix: mod.prefix === '/' ? undefined : mod.prefix });
  }

  // Versioned API root - quick sanity check that /v1 is alive.
  app.get('/v1', async () => ({ message: 'AutoBody Intake API v1', status: 'ok' }));

  return app;
}

