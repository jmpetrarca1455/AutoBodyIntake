import type { Prisma, Submission } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { buildStorageKey, storage } from '../storage/storage.service.js';
import {
  sendSubmissionEmail,
  type SendResult,
} from '../email/email.service.js';
import type { SubmissionWithRelations } from '../email/email.template.js';
import {
  buildVehicleSummary,
  type AttachmentKind,
  type CreateIntakeInput,
} from './intake.schemas.js';

/**
 * Business logic for intake submissions.
 *
 * Every submission is scoped to a shop (multi-tenancy). Frequently-searched
 * fields are promoted to real columns for fast listing/filtering, while the
 * full validated payload is kept in `data` so the form can grow freely.
 */
export async function createSubmission(
  shopId: string,
  input: CreateIntakeInput,
): Promise<Submission> {
  return prisma.submission.create({
    data: {
      shopId,
      customerName: input.contact.fullName,
      customerEmail: input.contact.email,
      customerPhone: input.contact.phone,
      vehicleInfo: buildVehicleSummary(input.vehicle),
      claimNumber: input.insurance?.claimNumber ?? input.claim?.policeReportNumber,
      data: input as unknown as Prisma.InputJsonValue,
    },
  });
}

export interface ListSubmissionsOptions {
  limit?: number;
  cursor?: string;
}

/** Paginated list of a shop's submissions (newest first). */
export async function listSubmissionsForShop(
  shopId: string,
  { limit = 25, cursor }: ListSubmissionsOptions = {},
): Promise<{ items: Submission[]; nextCursor: string | null }> {
  const take = Math.min(Math.max(limit, 1), 100);
  const items = await prisma.submission.findMany({
    where: { shopId },
    orderBy: { createdAt: 'desc' },
    take: take + 1, // fetch one extra to detect another page
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { attachments: true },
  });

  let nextCursor: string | null = null;
  if (items.length > take) {
    const next = items.pop();
    nextCursor = next?.id ?? null;
  }
  return { items, nextCursor };
}

export async function getSubmissionById(id: string): Promise<Submission | null> {
  return prisma.submission.findUnique({
    where: { id },
    include: { attachments: true, shop: true },
  });
}

// ── Attachments ─────────────────────────────────────────

export interface UploadAttachmentInput {
  shopId: string;
  submissionId: string;
  kind: AttachmentKind;
  fileName: string;
  contentType: string;
  body: Buffer;
}

/**
 * Persist an uploaded file: create the DB row (to mint an id), push bytes to
 * storage under a tenant-scoped key, then save the key back on the row.
 */
export async function uploadAttachment(input: UploadAttachmentInput) {
  const attachment = await prisma.attachment.create({
    data: {
      submissionId: input.submissionId,
      kind: input.kind,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.body.byteLength,
    },
  });

  const key = buildStorageKey({
    shopId: input.shopId,
    submissionId: input.submissionId,
    attachmentId: attachment.id,
    fileName: input.fileName,
  });

  const stored = await storage.put(key, input.body, input.contentType);

  return prisma.attachment.update({
    where: { id: attachment.id },
    data: { storageKey: stored.key, sizeBytes: stored.sizeBytes },
  });
}

export async function getAttachmentById(id: string) {
  return prisma.attachment.findUnique({
    where: { id },
    include: { submission: true },
  });
}

// ── Finalize (package + email to the shop) ──────────────

export interface FinalizeResult {
  submission: Submission;
  send: SendResult;
}

/**
 * Finalize a submission: package it into an email (with attachments) and send
 * it to the shop's secretary, then record the outcome on the submission.
 */
export async function finalizeSubmission(submissionId: string): Promise<FinalizeResult> {
  const submission = (await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { attachments: true, shop: true },
  })) as SubmissionWithRelations | null;

  if (!submission) {
    throw new Error('Submission not found');
  }

  try {
    const send = await sendSubmissionEmail(submission);
    const updated = await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'EMAILED', emailedAt: new Date() },
    });
    return { submission: updated, send };
  } catch (err) {
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'FAILED' },
    });
    throw err;
  }
}
