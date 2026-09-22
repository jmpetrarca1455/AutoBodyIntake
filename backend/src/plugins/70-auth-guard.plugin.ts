import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ShopRole } from '@autobody/shared';

/**
 * Tenant auth guard. Decorates the app with `app.authenticate` — a
 * preHandler that verifies the JWT and attaches the resolved `shopId` (and
 * `shopRole`/`userId`) to the request. Every protected route (dashboard, AI
 * triage, etc.) uses:
 *
 *   app.get('/dashboard/x', { preHandler: [app.authenticate] }, handler)
 *
 * and then reads `request.shopId` — never a client-supplied param — so a
 * shop can only ever see its own data.
 *
 * Multi-user roles: tokens carry a `role` claim (OWNER for the shop's own
 * login, STAFF for an invited team member). `app.requireOwner` is a second
 * preHandler (chained after `authenticate`) for actions staff shouldn't be
 * able to do — shop settings, staff management. Missing role on an older
 * token defaults to OWNER so pre-existing tokens keep working.
 */
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireOwner: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    shopId?: string;
    shopRole?: ShopRole;
    staffUserId?: string;
  }
}

export default fp(async (app: FastifyInstance) => {
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = await request.jwtVerify<{ shopId: string; role?: ShopRole; userId?: string }>();
      request.shopId = payload.shopId;
      request.shopRole = payload.role ?? 'OWNER';
      request.staffUserId = payload.userId;
    } catch {
      await reply.code(401).send({
        statusCode: 401,
        error: 'UNAUTHORIZED',
        message: 'Invalid or missing authentication token.',
      });
    }
  });

  app.decorate('requireOwner', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.shopRole !== 'OWNER') {
      await reply.code(403).send({
        statusCode: 403,
        error: 'FORBIDDEN',
        message: 'Only the shop owner can do this.',
      });
    }
  });
});


