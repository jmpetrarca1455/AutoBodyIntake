import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

/**
 * CORS policy. `origin: true` reflects the request origin for now — tighten
 * to a known allow-list of app/web origins before production launch.
 */
export default fp(async (app: FastifyInstance) => {
  await app.register(cors, {
    origin: true, // TODO: lock to known app origins before production launch.
  });
});


