import type { FastifyInstance } from 'fastify';
import {
  listSubmissions,
  getSubmission,
  getStats,
  updateShopSettings,
  runAiTriage,
} from './dashboard.service.js';

/**
 * Shop portal ("dashboard") endpoints — everything behind login. Every
 * route uses `app.authenticate` and reads `request.shopId` from the JWT, so
 * a shop can only ever see/modify its own data. This is the API a future
 * web/app dashboard UI will be built on top of.
 */
export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/dashboard/stats', async (request) => {
    return getStats(request.shopId!);
  });

  app.get('/dashboard/submissions', async (request) => {
    const query = request.query as { limit?: string; cursor?: string; status?: string };
    const limit = query.limit ? Number(query.limit) : undefined;
    return listSubmissions(request.shopId!, {
      limit: Number.isFinite(limit) ? limit : undefined,
      cursor: query.cursor,
      status: query.status,
    });
  });

  app.get('/dashboard/submissions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const submission = await getSubmission(request.shopId!, id);
    if (!submission) return reply.notFound('Submission not found');
    return submission;
  });

  // Generate (or regenerate) the AI triage summary for a submission.
  app.post('/dashboard/submissions/:id/ai-summary', async (request, reply) => {
    const { id } = request.params as { id: string };
    const summary = await runAiTriage(request.shopId!, id);
    if (!summary) return reply.notFound('Submission not found');
    return summary;
  });

  app.patch('/dashboard/shop', async (request) => {
    const body = request.body as Record<string, unknown>;
    return updateShopSettings(request.shopId!, {
      name: typeof body.name === 'string' ? body.name : undefined,
      address: typeof body.address === 'string' ? body.address : undefined,
      phone: typeof body.phone === 'string' ? body.phone : undefined,
      secretaryEmail: typeof body.secretaryEmail === 'string' ? body.secretaryEmail : undefined,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
    });
  });
}

