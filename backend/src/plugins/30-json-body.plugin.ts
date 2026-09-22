import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

/**
 * Tolerate empty bodies on JSON POSTs (e.g. action endpoints like
 * /finalize that carry no payload) instead of 400-ing on "empty JSON body".
 * Kept as its own plugin so the parsing behavior is a documented, isolated
 * concern rather than buried inline in app bootstrap.
 */
export default fp(async (app: FastifyInstance) => {
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req: unknown, body: string, done: (err: Error | null, value?: unknown) => void) => {
      const text = body.trim();
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
});


