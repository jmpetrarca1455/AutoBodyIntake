import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';

/**
 * JWT signing/verification for the shop portal. Kept as its own plugin
 * (rather than folded into the auth module) because other modules besides
 * auth need `request.jwtVerify()` / `app.jwt.sign()` — it's infrastructure,
 * not a feature.
 */
export default fp(async (app: FastifyInstance) => {
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
  });
});

