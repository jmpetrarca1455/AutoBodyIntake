import type { FastifyInstance } from 'fastify';
import type { Shop } from '@prisma/client';
import { config } from '../../config/index.js';
import { createShopSchema, intakeTokenParamsSchema, shopParamsSchema } from './shop.schemas.js';
import {
  createShop,
  getShopById,
  getShopByIntakeToken,
  listShops,
} from './shop.service.js';

/** Build the customer-facing intake link for a shop's token. */
function buildIntakeLink(token: string): string {
  return `${config.INTAKE_BASE_URL}/i/${token}`;
}

/** Full shop view (for shop-owner/admin responses). */
function toShopResponse(shop: Shop) {
  return {
    id: shop.id,
    name: shop.name,
    address: shop.address,
    phone: shop.phone,
    secretaryEmail: shop.secretaryEmail,
    intakeToken: shop.intakeToken,
    intakeLink: buildIntakeLink(shop.intakeToken),
    isActive: shop.isActive,
    createdAt: shop.createdAt,
    updatedAt: shop.updatedAt,
  };
}

/** Minimal public view (safe to expose to the intake app / customers). */
function toPublicShopResponse(shop: Shop) {
  return {
    name: shop.name,
    address: shop.address,
    intakeToken: shop.intakeToken,
    isActive: shop.isActive,
  };
}

/**
 * Shop registration & lookup endpoints.
 * A shop registers (providing its destination "secretary" email) and receives
 * a unique intake link/QR token to share with customers.
 */
export async function shopRoutes(app: FastifyInstance): Promise<void> {
  // Register a new shop.
  app.post('/shops', async (request, reply) => {
    const parsed = createShopSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }

    const shop = await createShop(parsed.data);
    return reply.code(201).send(toShopResponse(shop));
  });

  // List all shops (admin utility; will be auth-gated later).
  app.get('/shops', async () => {
    const shops = await listShops();
    return shops.map(toShopResponse);
  });

  // Fetch a single shop by id (shop-owner view).
  app.get('/shops/:id', async (request, reply) => {
    const parsed = shopParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.badRequest('Invalid shop id');
    }

    const shop = await getShopById(parsed.data.id);
    if (!shop) {
      return reply.notFound('Shop not found');
    }
    return toShopResponse(shop);
  });

  // Public lookup by intake token — used by the intake app to greet the
  // customer with the shop's name before they fill out the form.
  app.get('/intake/:token/shop', async (request, reply) => {
    const parsed = intakeTokenParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.badRequest('Invalid intake token');
    }

    const shop = await getShopByIntakeToken(parsed.data.token);
    if (!shop || !shop.isActive) {
      return reply.notFound('Intake link not found or inactive');
    }
    return toPublicShopResponse(shop);
  });
}

