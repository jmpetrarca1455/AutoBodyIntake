import type { FastifyInstance } from 'fastify';
import {
  draftStatusUpdateSchema,
  sendStatusUpdateSchema,
  sendAdjusterEmailSchema,
  logCommunicationNoteSchema,
  sendGenericEmailSchema,
} from '@autobody/shared';
import {
  draftAdjusterEmailForSubmission,
  draftStatusUpdateForSubmission,
  listCommunications,
  logCommunicationNote,
  sendAdjusterEmail,
  sendGenericEmail,
  sendStatusUpdate,
} from './communications.service.js';

/**
 * Customer/adjuster communications endpoints — draft-then-send for both
 * status updates (SMS/email) and adjuster follow-up emails, plus a full
 * audit-log read per submission. All routes are shop-scoped via the JWT
 * (auth guard applied here, same convention as the dashboard module).
 */
export async function communicationsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/dashboard/submissions/:id/communications', async (request, reply) => {
    const { id } = request.params as { id: string };
    const log = await listCommunications(request.shopId!, id);
    if (!log) return reply.notFound('Submission not found');
    return log;
  });

  // AI-draft a status update message for staff to review before sending.
  app.post('/dashboard/submissions/:id/status-updates/draft', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = draftStatusUpdateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.badRequest(body.error.issues.map((i) => i.message).join('; '));
    }
    const draft = await draftStatusUpdateForSubmission(request.shopId!, id, body.data);
    if (!draft) return reply.notFound('Submission not found');
    return draft;
  });

  // Send the (possibly staff-edited) status update via SMS or email.
  app.post('/dashboard/submissions/:id/status-updates', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = sendStatusUpdateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.badRequest(body.error.issues.map((i) => i.message).join('; '));
    }
    const entry = await sendStatusUpdate(request.shopId!, id, body.data);
    if (!entry) return reply.notFound('Submission not found');
    return entry;
  });

  // AI-draft an adjuster follow-up email for staff to review before sending.
  app.post('/dashboard/submissions/:id/adjuster-email/draft', async (request, reply) => {
    const { id } = request.params as { id: string };
    const draft = await draftAdjusterEmailForSubmission(request.shopId!, id);
    if (!draft) return reply.notFound('Submission not found');
    return draft;
  });

  // Send the (possibly staff-edited) adjuster follow-up email.
  app.post('/dashboard/submissions/:id/adjuster-email/send', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = sendAdjusterEmailSchema.safeParse(request.body);
    if (!body.success) {
      return reply.badRequest(body.error.issues.map((i) => i.message).join('; '));
    }
    const entry = await sendAdjusterEmail(request.shopId!, id, body.data);
    if (!entry) return reply.notFound('Submission not found');
    return entry;
  });

  // Manually log a communication that happened outside the portal (a call,
  // an in-person conversation, etc.) — no send, just an audit-trail entry.
  app.post('/dashboard/submissions/:id/communications/note', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = logCommunicationNoteSchema.safeParse(request.body);
    if (!body.success) {
      return reply.badRequest(body.error.issues.map((i) => i.message).join('; '));
    }
    const entry = await logCommunicationNote(request.shopId!, id, body.data);
    if (!entry) return reply.notFound('Submission not found');
    return entry;
  });

  // Send a freeform email to any non-customer recipient (parts supplier,
  // insurance company directly, etc.), logged to the same audit trail.
  app.post('/dashboard/submissions/:id/communications/email', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = sendGenericEmailSchema.safeParse(request.body);
    if (!body.success) {
      return reply.badRequest(body.error.issues.map((i) => i.message).join('; '));
    }
    const entry = await sendGenericEmail(request.shopId!, id, body.data);
    if (!entry) return reply.notFound('Submission not found');
    return entry;
  });
}



