import { prisma } from '../../lib/prisma.js';
import { generateTriageSummary } from '../ai/ai.service.js';
import type { CreateIntakeInput } from '@autobody/shared';
import type { Prisma } from '@prisma/client';

/**
 * Dashboard business logic — everything a logged-in shop needs to run their
 * day: submission inbox, stats, settings, and triggering AI triage. Always
 * scoped by shopId (from the authenticated JWT), never a client-supplied id.
 */

export interface ListOptions {
  limit?: number;
  cursor?: string;
  status?: string;
}

export async function listSubmissions(shopId: string, opts: ListOptions = {}) {
  const take = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const items = await prisma.submission.findMany({
    where: { shopId, ...(opts.status ? { status: opts.status as never } : {}) },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { attachments: true },
  });
  let nextCursor: string | null = null;
  if (items.length > take) {
    nextCursor = items.pop()?.id ?? null;
  }
  return { items, nextCursor };
}

export async function getSubmission(shopId: string, submissionId: string) {
  return prisma.submission.findFirst({
    where: { id: submissionId, shopId },
    include: { attachments: true },
  });
}

/** Quick counts for the dashboard home screen. */
export async function getStats(shopId: string) {
  const [total, received, emailed, failed, last7Days] = await Promise.all([
    prisma.submission.count({ where: { shopId } }),
    prisma.submission.count({ where: { shopId, status: 'RECEIVED' } }),
    prisma.submission.count({ where: { shopId, status: 'EMAILED' } }),
    prisma.submission.count({ where: { shopId, status: 'FAILED' } }),
    prisma.submission.count({
      where: { shopId, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
  ]);
  return { total, received, emailed, failed, last7Days };
}

export interface UpdateShopSettingsInput {
  name?: string;
  address?: string;
  phone?: string;
  secretaryEmail?: string;
  isActive?: boolean;
}

export async function updateShopSettings(shopId: string, input: UpdateShopSettingsInput) {
  return prisma.shop.update({ where: { id: shopId }, data: input });
}

/** Generate (or regenerate) the AI triage summary for a submission and persist it. */
export async function runAiTriage(shopId: string, submissionId: string) {
  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, shopId },
    include: { attachments: true },
  });
  if (!submission) return null;

  const summary = await generateTriageSummary({
    data: submission.data as unknown as CreateIntakeInput,
    attachmentCount: submission.attachments.length,
  });

  await prisma.submission.update({
    where: { id: submissionId },
    data: {
      aiSummary: summary as unknown as Prisma.InputJsonValue,
      aiSummaryGeneratedAt: new Date(),
    },
  });

  return summary;
}

