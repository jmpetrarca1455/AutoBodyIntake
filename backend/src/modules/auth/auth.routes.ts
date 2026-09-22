import type { FastifyInstance } from 'fastify';
import type { Shop, ShopUser } from '@prisma/client';
import { signupSchema, loginSchema, createStaffSchema } from './auth.schemas.js';
import {
  signupShop,
  verifyLogin,
  getShopForAuth,
  createStaffUser,
  listStaffUsers,
  deactivateStaffUser,
} from './auth.service.js';

function toAuthShop(shop: Shop) {
  return { id: shop.id, name: shop.name, ownerEmail: shop.ownerEmail };
}

function toStaffMember(user: ShopUser) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

/**
 * Shop portal authentication endpoints. This is the front door of the
 * sellable product: a shop signs up, gets a token, and everything else
 * (dashboard, AI triage) is scoped to their shopId via the JWT. Also hosts
 * owner-only staff management (invite/list/deactivate team logins).
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/signup', async (request, reply) => {
    const parsed = signupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }

    const shop = await signupShop(parsed.data);
    const token = app.jwt.sign({ shopId: shop.id, role: 'OWNER' });
    return reply.code(201).send({ token, shop: toAuthShop(shop), role: 'OWNER' });
  });

  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest('Email and password are required.');
    }

    const result = await verifyLogin(parsed.data);
    const token = app.jwt.sign(
      result.role === 'OWNER'
        ? { shopId: result.shop.id, role: 'OWNER' }
        : { shopId: result.shop.id, role: 'STAFF', userId: result.userId },
    );
    return reply.send({ token, shop: toAuthShop(result.shop), role: result.role });
  });

  app.get('/auth/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const shop = await getShopForAuth(request.shopId!);
    if (!shop) {
      return reply.notFound('Shop not found');
    }
    return { ...toAuthShop(shop), role: request.shopRole };
  });

  // ── Staff management (owner-only) ─────────────────────
  app.post(
    '/auth/staff',
    { preHandler: [app.authenticate, app.requireOwner] },
    async (request, reply) => {
      const parsed = createStaffSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.badRequest(parsed.error.issues.map((i) => i.message).join('; '));
      }
      const staff = await createStaffUser(request.shopId!, parsed.data);
      return reply.code(201).send(toStaffMember(staff));
    },
  );

  app.get(
    '/auth/staff',
    { preHandler: [app.authenticate, app.requireOwner] },
    async (request) => {
      const staff = await listStaffUsers(request.shopId!);
      return staff.map(toStaffMember);
    },
  );

  app.delete(
    '/auth/staff/:id',
    { preHandler: [app.authenticate, app.requireOwner] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const staff = await deactivateStaffUser(request.shopId!, id);
      return reply.send(toStaffMember(staff));
    },
  );
}


