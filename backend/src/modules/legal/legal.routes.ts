import type { FastifyInstance } from 'fastify';
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from './legal.content.js';

/**
 * Public legal document endpoints — plain text (not HTML) so they render
 * correctly with zero styling work and are trivially linkable from the app
 * (shop signup consent checkbox, customer intake footer).
 */
export async function legalRoutes(app: FastifyInstance): Promise<void> {
  app.get('/legal/terms', async (_request, reply) => {
    reply.type('text/plain; charset=utf-8');
    return TERMS_OF_SERVICE;
  });

  app.get('/legal/privacy', async (_request, reply) => {
    reply.type('text/plain; charset=utf-8');
    return PRIVACY_POLICY;
  });
}

