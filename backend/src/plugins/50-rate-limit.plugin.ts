import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config/index.js';

/**
 * Global request rate limiting. The intake endpoints are public (no auth —
 * anyone with a shop's link can submit), so without this a single bad actor
 * could hammer the API or run up storage/email costs. Generous enough for
 * legitimate bursts (a customer uploading several photos) but caps abuse.
 */
export default fp(async (app: FastifyInstance) => {
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    // Keyed by IP by default; revisit once we have per-shop/tenant auth.
    ban: 0,
    errorResponseBuilder: (_req: FastifyRequest, context: { after: string | number }) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded, retry in ${Math.ceil(Number(context.after))}.`,
    }),
  });
});


