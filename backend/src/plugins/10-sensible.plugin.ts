import fp from 'fastify-plugin';
import sensible from '@fastify/sensible';
import type { FastifyInstance } from 'fastify';

/**
 * @fastify/sensible — adds reply.notFound(), reply.badRequest(), etc.
 * Wrapped with fastify-plugin so it decorates the parent (not encapsulated).
 */
export default fp(async (app: FastifyInstance) => {
  await app.register(sensible);
});


