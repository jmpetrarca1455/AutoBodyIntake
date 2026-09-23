import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import { corsAllowedOrigins } from '../config/index.js';

/**
 * CORS policy. When `CORS_ALLOWED_ORIGINS` is set, only those origins are
 * allowed (lock this down before a public launch). Falls back to reflecting
 * any origin in dev so local testing (web on any port, physical devices on
 * a LAN IP) works with zero config.
 */
export default fp(async (app: FastifyInstance) => {
  await app.register(cors, {
    origin: corsAllowedOrigins ?? true,
  });
});



