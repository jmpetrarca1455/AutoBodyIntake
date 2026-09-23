import type { FastifyInstance } from 'fastify';
import { createEstimateLineItemSchema, updateEstimateLineItemSchema } from '@autobody/shared';
import {
  createEstimateLine,
  deleteEstimateLine,
  listEstimateLines,
  updateEstimateLine,
} from './estimate-lines.service.js';

/**
 * Line-item repair estimate endpoints — the shop's real cost estimate
 * (parts/labor/paint materials/sublet/misc), shop-scoped via the JWT like
 * every other dashboard route.
 */
export async function estimateLinesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/dashboard/submissions/:id/estimate-lines', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await listEstimateLines(request.shopId!, id);
    if (!result) return reply.notFound('Submission not found');
    return result;
  });

  app.post('/dashboard/submissions/:id/estimate-lines', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = createEstimateLineItemSchema.safeParse(request.body);
    if (!body.success) {
      return reply.badRequest(body.error.issues.map((i) => i.message).join('; '));
    }
    const line = await createEstimateLine(request.shopId!, id, body.data);
    if (!line) return reply.notFound('Submission not found');
    return reply.code(201).send(line);
  });

  app.patch('/dashboard/submissions/:id/estimate-lines/:lineId', async (request, reply) => {
    const { id, lineId } = request.params as { id: string; lineId: string };
    const body = updateEstimateLineItemSchema.safeParse(request.body);
    if (!body.success) {
      return reply.badRequest(body.error.issues.map((i) => i.message).join('; '));
    }
    const line = await updateEstimateLine(request.shopId!, id, lineId, body.data);
    if (!line) return reply.notFound('Estimate line not found');
    return line;
  });

  app.delete('/dashboard/submissions/:id/estimate-lines/:lineId', async (request, reply) => {
    const { id, lineId } = request.params as { id: string; lineId: string };
    const ok = await deleteEstimateLine(request.shopId!, id, lineId);
    if (!ok) return reply.notFound('Estimate line not found');
    return { deleted: true };
  });
}

