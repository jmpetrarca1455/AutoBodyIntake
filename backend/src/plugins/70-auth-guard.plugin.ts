import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Tenant auth guard. Decorates the app with `app.authenticate` — a
 * preHandler that verifies the JWT and attaches the resolved `shopId` to the
 * request. Every protected route (dashboard, AI triage, etc.) uses:
 *
 *   app.get('/dashboard/x', { preHandler: [app.authenticate] }, handler)
 *
 * and then reads `request.shopId` — never a client-supplied param — so a
 * shop can only ever see its own data. This is the seam future multi-user
 * roles (staff vs. owner) would extend.
 */
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    shopId?: string;
  }
}

export default fp(async (app: FastifyInstance) => {
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = await request.jwtVerify<{ shopId: string }>();
      request.shopId = payload.shopId;
    } catch {
      await reply.code(401).send({
        statusCode: 401,
        error: 'UNAUTHORIZED',
        message: 'Invalid or missing authentication token.',
      });
    }
  });
});

