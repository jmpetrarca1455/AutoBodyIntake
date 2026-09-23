import type { FastifyInstance } from 'fastify';
import { createPartsOrderSchema, updatePartsOrderSchema } from '@autobody/shared';
import {
  createPartsOrder,
  deletePartsOrder,
  listPartsOrders,
  listShopPartsOrders,
  updatePartsOrder,
} from './parts-orders.service.js';

/**
 * Parts procurement/tracking endpoints — per-submission CRUD plus a
 * shop-wide cross-RO view for the front-desk "everything on order" screen.
 * Shop-scoped via the JWT like every other dashboard route.
 */
export async function partsOrdersRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  // Shop-wide view across every open repair order (register before the
  // per-submission routes so `/parts-orders` isn't swallowed by a param).
  app.get('/dashboard/parts-orders', async (request) => {
    return listShopPartsOrders(request.shopId!);
  });

  app.get('/dashboard/submissions/:id/parts-orders', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await listPartsOrders(request.shopId!, id);
    if (!result) return reply.notFound('Submission not found');
    return result;
  });

  app.post('/dashboard/submissions/:id/parts-orders', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = createPartsOrderSchema.safeParse(request.body);
    if (!body.success) {
      return reply.badRequest(body.error.issues.map((i) => i.message).join('; '));
    }
    const order = await createPartsOrder(request.shopId!, id, body.data);
    if (!order) return reply.notFound('Submission not found');
    return reply.code(201).send(order);
  });

  app.patch('/dashboard/submissions/:id/parts-orders/:orderId', async (request, reply) => {
    const { id, orderId } = request.params as { id: string; orderId: string };
    const body = updatePartsOrderSchema.safeParse(request.body);
    if (!body.success) {
      return reply.badRequest(body.error.issues.map((i) => i.message).join('; '));
    }
    const order = await updatePartsOrder(request.shopId!, id, orderId, body.data);
    if (!order) return reply.notFound('Parts order not found');
    return order;
  });

  app.delete('/dashboard/submissions/:id/parts-orders/:orderId', async (request, reply) => {
    const { id, orderId } = request.params as { id: string; orderId: string };
    const ok = await deletePartsOrder(request.shopId!, id, orderId);
    if (!ok) return reply.notFound('Parts order not found');
    return { deleted: true };
  });
}

