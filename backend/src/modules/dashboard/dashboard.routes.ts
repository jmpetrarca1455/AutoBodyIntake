import type { FastifyInstance } from 'fastify';
import { attachmentKind, staffUpdateSubmissionSchema, ALLOWED_UPLOAD_CONTENT_TYPES } from '@autobody/shared';
import {
  listSubmissions,
  getSubmission,
  updateSubmission,
  getStats,
  getShopSettings,
  updateShopSettings,
  runAiTriage,
  runDamageAssessment,
  getSmartQueue,
  getShopReports,
  getSchedule,
  getDigest,
  suggestPickupDate,
  uploadStaffAttachment,
  deleteAttachment,
} from './dashboard.service.js';
import { runAdjusterFollowUpSweep } from '../automation/automation.service.js';

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

  // Ranked, shop-wide worklist — see dashboard.service.ts `getSmartQueue`.
  app.get('/dashboard/queue', async (request) => {
    return getSmartQueue(request.shopId!);
  });

  // Basic shop KPI report — cycle time, status breakdown, avg estimate
  // value, outstanding parts orders. See dashboard.service.ts `getShopReports`.
  app.get('/dashboard/reports', async (request) => {
    return getShopReports(request.shopId!);
  });

  // Shop-wide scheduling view — every submission with a scheduled
  // drop-off/pickup, soonest first.
  app.get('/dashboard/schedule', async (request) => {
    return getSchedule(request.shopId!);
  });

  // AI Daily Digest — narrative morning-briefing summary of the whole shop.
  app.get('/dashboard/digest', async (request) => {
    return getDigest(request.shopId!);
  });

  // Rule-based suggested pickup/completion date for a single submission —
  // never auto-applied, just a starting point for the Scheduling section.
  app.get('/dashboard/submissions/:id/suggested-pickup-date', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await suggestPickupDate(request.shopId!, id);
    if (!result) return reply.notFound('Submission not found');
    return result;
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

  // Staff "edit customer file" — patch any intake field group and/or move
  // the submission's lifecycle status (e.g. mark ESTIMATE_READY).
  app.patch('/dashboard/submissions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = staffUpdateSubmissionSchema.safeParse(request.body);
    if (!body.success) {
      return reply.badRequest(body.error.issues.map((i) => i.message).join('; '));
    }
    const submission = await updateSubmission(request.shopId!, id, body.data);
    if (!submission) return reply.notFound('Submission not found');
    return submission;
  });

  // Staff upload/replace an attachment — add a new document of any kind
  // (insurance card, license, registration, estimate, etc.) or upload a
  // fresher copy of one that already exists. Always adds a new Attachment
  // row (never mutates history) so old versions stay in the file.
  app.post('/dashboard/submissions/:id/attachments', async (request, reply) => {
    const { id } = request.params as { id: string };

    const kind = attachmentKind.safeParse((request.query as { kind?: string }).kind);
    if (!kind.success) {
      return reply.badRequest(
        `Invalid or missing "kind" (allowed: ${attachmentKind.options.join(', ')})`,
      );
    }

    const file = await request.file();
    if (!file) {
      return reply.badRequest('No file uploaded (expected multipart form-data)');
    }
    if (!ALLOWED_UPLOAD_CONTENT_TYPES.has(file.mimetype)) {
      return reply.unsupportedMediaType(
        `Unsupported file type "${file.mimetype}". Allowed: images and PDF.`,
      );
    }
    const body = await file.toBuffer();
    if (file.file.truncated) {
      return reply.payloadTooLarge('File exceeds the maximum upload size.');
    }

    const attachment = await uploadStaffAttachment(request.shopId!, id, {
      kind: kind.data,
      fileName: file.filename,
      contentType: file.mimetype,
      body,
    });
    if (!attachment) return reply.notFound('Submission not found');

    return reply.code(201).send({
      id: attachment.id,
      kind: attachment.kind,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      downloadUrl: `/v1/attachments/${attachment.id}`,
    });
  });

  // Remove an attachment that was uploaded in error (e.g. wrong document).
  app.delete('/dashboard/submissions/:id/attachments/:attachmentId', async (request, reply) => {
    const { id, attachmentId } = request.params as { id: string; attachmentId: string };
    const ok = await deleteAttachment(request.shopId!, id, attachmentId);
    if (!ok) return reply.notFound('Attachment not found');
    return reply.send({ deleted: true });
  });

  // Generate (or regenerate) the AI triage summary for a submission.
  app.post('/dashboard/submissions/:id/ai-summary', async (request, reply) => {
    const { id } = request.params as { id: string };
    const summary = await runAiTriage(request.shopId!, id);
    if (!summary) return reply.notFound('Submission not found');
    return summary;
  });

  // Generate (or regenerate) the AI damage assessment (severity/scope triage
  // read from the damage photos) for a submission.
  app.post('/dashboard/submissions/:id/damage-assessment', async (request, reply) => {
    const { id } = request.params as { id: string };
    const assessment = await runDamageAssessment(request.shopId!, id);
    if (!assessment) return reply.notFound('Submission not found');
    return assessment;
  });

  // Full shop settings, including the shareable intake link/token — every
  // logged-in user (owner or staff) can view this; only owners can edit it.
  app.get('/dashboard/shop', async (request, reply) => {
    const shop = await getShopSettings(request.shopId!);
    if (!shop) return reply.notFound('Shop not found');
    return { ...shop, role: request.shopRole };
  });

  app.patch('/dashboard/shop', { preHandler: [app.requireOwner] }, async (request) => {
    const body = request.body as Record<string, unknown>;
    return updateShopSettings(request.shopId!, {
      name: typeof body.name === 'string' ? body.name : undefined,
      address: typeof body.address === 'string' ? body.address : undefined,
      phone: typeof body.phone === 'string' ? body.phone : undefined,
      secretaryEmail: typeof body.secretaryEmail === 'string' ? body.secretaryEmail : undefined,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
    });
  });

  // Manually trigger the automated adjuster follow-up sweep for just this
  // shop (useful for testing without waiting for the background interval,
  // or for shops that prefer an on-demand "nudge all stale claims" button
  // over the always-on background scheduler). Owner-only since it sends
  // real emails without a per-message review step.
  app.post(
    '/dashboard/automation/adjuster-followups/run',
    { preHandler: [app.requireOwner] },
    async (request) => {
      return runAdjusterFollowUpSweep(request.shopId!);
    },
  );
}



















