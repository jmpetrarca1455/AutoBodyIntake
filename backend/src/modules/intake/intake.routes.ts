import type { FastifyInstance } from 'fastify';
import { getShopByIntakeToken } from '../shops/shop.service.js';
import { intakeTokenParamsSchema } from '../shops/shop.schemas.js';
import { storage } from '../storage/storage.service.js';
import { AppError, ValidationError } from '../../core/errors.js';
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  attachmentKind,
  createIntakeSchema,
  submissionParamsSchema,
} from './intake.schemas.js';
import {
  createSubmission,
  finalizeSubmission,
  getAttachmentById,
  getSubmissionById,
  listSubmissionsForShop,
  runOcrOnAttachment,
  uploadAttachment,
} from './intake.service.js';

/**
 * Intake submission endpoints.
 *
 * The customer-facing submit route is keyed by the shop's public intake token
 * (from the link/QR), so no auth is needed for a customer to submit — but the
 * token scopes every submission to exactly one shop. Shop-owner routes for
 * listing/reading submissions will be auth-gated in a later phase.
 */
export async function intakeRoutes(app: FastifyInstance): Promise<void> {
  // Submit an intake for a shop identified by its intake token.
  app.post('/intake/:token', async (request, reply) => {
    const params = intakeTokenParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.badRequest('Invalid intake token');
    }

    const shop = await getShopByIntakeToken(params.data.token);
    if (!shop || !shop.isActive) {
      return reply.notFound('Intake link not found or inactive');
    }

    const body = createIntakeSchema.safeParse(request.body);
    if (!body.success) {
      return reply.badRequest(
        body.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }

    const submission = await createSubmission(shop.id, body.data);

    // NOTE: email packaging & delivery to shop.secretaryEmail is wired in the
    // next phase (email module). For now we persist and confirm receipt.
    return reply.code(201).send({
      id: submission.id,
      status: submission.status,
      shopName: shop.name,
      receivedAt: submission.createdAt,
      message: 'Your information was received. The shop will be in touch shortly.',
    });
  });

  // Upload a file/photo to a submission. Customer-facing: authorized by the
  // shop's intake token + the submission id (both from the confirmed submit).
  app.post('/intake/:token/submissions/:submissionId/attachments', async (request, reply) => {
    const token = intakeTokenParamsSchema.safeParse(request.params);
    const submissionId = (request.params as { submissionId?: string }).submissionId;
    if (!token.success || !submissionId) {
      return reply.badRequest('Invalid token or submission id');
    }

    const shop = await getShopByIntakeToken(token.data.token);
    if (!shop || !shop.isActive) {
      return reply.notFound('Intake link not found or inactive');
    }

    const submission = await getSubmissionById(submissionId);
    if (!submission || submission.shopId !== shop.id) {
      return reply.notFound('Submission not found for this shop');
    }

    // `kind` categorizes the file (e.g. damage_photo). Accept via query string.
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
    // @fastify/multipart flags oversized files (limit set in app.ts).
    if (file.file.truncated) {
      return reply.payloadTooLarge('File exceeds the maximum upload size.');
    }

    const attachment = await uploadAttachment({
      shopId: shop.id,
      submissionId: submission.id,
      kind: kind.data,
      fileName: file.filename,
      contentType: file.mimetype,
      body,
    });

    return reply.code(201).send({
      id: attachment.id,
      kind: attachment.kind,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      downloadUrl: `/v1/attachments/${attachment.id}`,
    });
  });

  // Auto-fill: run OCR on a license/insurance-card/VIN photo and return the
  // extracted fields so the customer app can pre-fill the rest of the form.
  // Best-effort by design (see ocr.service.ts) — never a hard dependency.
  app.post(
    '/intake/:token/submissions/:submissionId/attachments/:attachmentId/ocr',
    async (request, reply) => {
      const token = intakeTokenParamsSchema.safeParse(request.params);
      const { submissionId, attachmentId } = request.params as {
        submissionId?: string;
        attachmentId?: string;
      };
      if (!token.success || !submissionId || !attachmentId) {
        return reply.badRequest('Invalid token, submission id, or attachment id');
      }

      const shop = await getShopByIntakeToken(token.data.token);
      if (!shop || !shop.isActive) {
        return reply.notFound('Intake link not found or inactive');
      }

      const submission = await getSubmissionById(submissionId);
      if (!submission || submission.shopId !== shop.id) {
        return reply.notFound('Submission not found for this shop');
      }

      const attachment = await getAttachmentById(attachmentId);
      if (!attachment || attachment.submissionId !== submissionId) {
        return reply.notFound('Attachment not found for this submission');
      }

      try {
        const updated = await runOcrOnAttachment(attachmentId);
        return reply.send({
          id: updated.id,
          ocrData: updated.ocrData,
          ocrGeneratedAt: updated.ocrGeneratedAt,
        });
      } catch (err) {
        if (err instanceof ValidationError) {
          return reply.badRequest(err.message);
        }
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send({
            statusCode: err.statusCode,
            error: err.code,
            message: err.message,
          });
        }
        request.log.error(err, 'OCR extraction failed');
        return reply.internalServerError('Could not extract document fields.');
      }
    },
  );

  // Finalize a submission: package everything and email it to the shop's
  // secretary. Called after the customer has attached their photos/docs.
  app.post('/intake/:token/submissions/:submissionId/finalize', async (request, reply) => {
    const token = intakeTokenParamsSchema.safeParse(request.params);
    const submissionId = (request.params as { submissionId?: string }).submissionId;
    if (!token.success || !submissionId) {
      return reply.badRequest('Invalid token or submission id');
    }

    const shop = await getShopByIntakeToken(token.data.token);
    if (!shop || !shop.isActive) {
      return reply.notFound('Intake link not found or inactive');
    }

    const submission = await getSubmissionById(submissionId);
    if (!submission || submission.shopId !== shop.id) {
      return reply.notFound('Submission not found for this shop');
    }

    try {
      const { submission: updated, send } = await finalizeSubmission(submissionId);
      return reply.send({
        id: updated.id,
        status: updated.status,
        emailedAt: updated.emailedAt,
        delivery: { driver: send.driver, to: send.to },
        message: 'Thanks! Your information was sent to the shop.',
      });
    } catch (err) {
      request.log.error(err, 'Failed to finalize/email submission');
      return reply.internalServerError('Could not deliver the submission to the shop.');
    }
  });

  // Download an attachment (owner view). Redirects to a presigned URL for S3,
  // or streams the file directly when using local-disk storage.
  app.get('/attachments/:id', async (request, reply) => {
    const params = submissionParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.badRequest('Invalid attachment id');
    }

    const attachment = await getAttachmentById(params.data.id);
    if (!attachment || !attachment.storageKey) {
      return reply.notFound('Attachment not found');
    }

    const result = await storage.getDownload(attachment.storageKey, attachment.contentType);
    if (result.redirectUrl) {
      return reply.redirect(result.redirectUrl);
    }
    reply.header('Content-Type', attachment.contentType);
    reply.header('Content-Disposition', `inline; filename="${attachment.fileName}"`);
    return reply.send(result.stream);
  });

  // List a shop's submissions (owner view — cursor paginated).
  app.get('/shops/:id/submissions', async (request, reply) => {
    const params = submissionParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.badRequest('Invalid shop id');
    }

    const query = request.query as { limit?: string; cursor?: string };
    const limit = query.limit ? Number(query.limit) : undefined;

    const { items, nextCursor } = await listSubmissionsForShop(params.data.id, {
      limit: Number.isFinite(limit) ? limit : undefined,
      cursor: query.cursor,
    });

    return { items, nextCursor };
  });

  // Read a single submission (owner view — full payload + attachments).
  app.get('/submissions/:id', async (request, reply) => {
    const params = submissionParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.badRequest('Invalid submission id');
    }

    const submission = await getSubmissionById(params.data.id);
    if (!submission) {
      return reply.notFound('Submission not found');
    }
    return submission;
  });
}








