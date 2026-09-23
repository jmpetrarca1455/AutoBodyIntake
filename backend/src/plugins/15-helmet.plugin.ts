import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';

/**
 * Security headers (X-Content-Type-Options, X-Frame-Options, Strict-Transport-
 * Security, etc.) via @fastify/helmet. CSP is disabled — this is a JSON API
 * (+ a couple of HTML responses: email previews, legal pages), not a
 * browser-rendered app, so a strict default-src CSP would be more likely to
 * break legitimate embeds (e.g. email preview HTML) than stop anything real.
 */
export default fp(async (app: FastifyInstance) => {
  await app.register(helmet, {
    contentSecurityPolicy: false,
    global: true,
  });
});

