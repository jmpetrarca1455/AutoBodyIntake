import type { FastifyInstance } from 'fastify';
import type { Shop } from '@prisma/client';
import { signupSchema, loginSchema } from './auth.schemas.js';
import { signupShop, verifyLogin, getShopForAuth } from './auth.service.js';

function toAuthShop(shop: Shop) {
  return { id: shop.id, name: shop.name, ownerEmail: shop.ownerEmail };
}

/**
 * Shop portal authentication endpoints. This is the front door of the
 * sellable product: a shop signs up, gets a token, and everything else
 * (dashboard, AI triage) is scoped to their shopId via the JWT.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/signup', async (request, reply) => {
    const parsed = signupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }

    const shop = await signupShop(parsed.data);
    const token = app.jwt.sign({ shopId: shop.id });
    return reply.code(201).send({ token, shop: toAuthShop(shop) });
  });

  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest('Email and password are required.');
    }

    const shop = await verifyLogin(parsed.data);
    const token = app.jwt.sign({ shopId: shop.id });
    return reply.send({ token, shop: toAuthShop(shop) });
  });

  app.get('/auth/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const shop = await getShopForAuth(request.shopId!);
    if (!shop) {
      return reply.notFound('Shop not found');
    }
    return toAuthShop(shop);
  });
}

