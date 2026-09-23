import { prisma } from '../../lib/prisma.js';
import { config } from '../../config/index.js';
import { generateTriageSummary } from '../ai/ai.service.js';
import { assessDamage } from '../ai/estimate.service.js';
import { storage } from '../storage/storage.service.js';
import type { CreateIntakeInput, AiTriageSummary, QueueItem } from '@autobody/shared';
import type { Prisma } from '@prisma/client';

/**
 * Dashboard business logic — everything a logged-in shop needs to run their
 * day: submission inbox, stats, settings, and triggering AI triage. Always
 * scoped by shopId (from the authenticated JWT), never a client-supplied id.
 */

/** The shop's own settings, including its shareable intake link/token. */
export async function getShopSettings(shopId: string) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) return null;
  return {
    id: shop.id,
    name: shop.name,
    address: shop.address,
    phone: shop.phone,
    secretaryEmail: shop.secretaryEmail,
    ownerEmail: shop.ownerEmail,
    intakeToken: shop.intakeToken,
    intakeLink: `${config.INTAKE_BASE_URL}/i/${shop.intakeToken}`,
    isActive: shop.isActive,
    createdAt: shop.createdAt,
  };
}

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

/** Generate (or regenerate) the AI damage assessment for a submission and persist it. */
export async function runDamageAssessment(shopId: string, submissionId: string) {
  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, shopId },
    include: { attachments: true },
  });
  if (!submission) return null;

  const damagePhotos = submission.attachments.filter(
    (a) => a.kind === 'damage_photo' && a.storageKey && a.contentType.startsWith('image/'),
  );

  const images: Array<{ buffer: Buffer; contentType: string }> = [];
  for (const photo of damagePhotos.slice(0, 6)) {
    try {
      const buffer = await storage.getBytes(photo.storageKey!);
      images.push({ buffer, contentType: photo.contentType });
    } catch {
      // Skip unreadable files rather than failing the whole assessment.
    }
  }

  const data = submission.data as unknown as CreateIntakeInput;
  const assessment = await assessDamage({
    damageDescription: data.vehicle?.damageDescription,
    vehicleInfo: submission.vehicleInfo,
    images,
  });

  await prisma.submission.update({
    where: { id: submissionId },
    data: {
      damageAssessment: assessment as unknown as Prisma.InputJsonValue,
      damageAssessmentGeneratedAt: new Date(),
    },
  });

  return assessment;
}

/**
 * The "Smart Queue" — ranks all active (non-archived) submissions by what
 * actually needs attention right now, reusing each submission's cached AI
 * triage rather than calling the AI again. Deterministic and instant.
 */
const PRIORITY_WEIGHT: Record<string, number> = { urgent: 100, high: 60, medium: 30, low: 10 };

export async function getSmartQueue(shopId: string): Promise<QueueItem[]> {
  const submissions = await prisma.submission.findMany({
    where: { shopId, status: { not: 'ARCHIVED' } },
    orderBy: { createdAt: 'asc' },
  });

  const items: QueueItem[] = submissions.map((s) => {
    const ai = s.aiSummary as unknown as AiTriageSummary | null;
    const priority = ai?.priority ?? null;
    const missingInfoCount = ai?.missingInfo.length ?? 0;
    const ageHours = Math.max(0, (Date.now() - s.createdAt.getTime()) / (60 * 60 * 1000));

    const priorityScore = priority ? PRIORITY_WEIGHT[priority] ?? 0 : 20; // untriaged = treat as medium-ish
    const ageScore = Math.min(ageHours, 72) / 72 * 20; // up to +20 for a submission that's sat 3+ days
    const missingScore = Math.min(missingInfoCount, 5) * 2;
    const score = priorityScore + ageScore + missingScore;

    const reasons: string[] = [];
    if (priority === 'urgent') reasons.push('AI flagged urgent');
    else if (priority === 'high') reasons.push('AI flagged high priority');
    if (!priority) reasons.push('not yet triaged');
    if (ageHours > 48) reasons.push(`waiting ${Math.round(ageHours / 24)}+ days`);
    if (missingInfoCount > 0) reasons.push(`${missingInfoCount} field(s) missing`);

    return {
      id: s.id,
      customerName: s.customerName,
      vehicleInfo: s.vehicleInfo,
      status: s.status,
      priority,
      missingInfoCount,
      ageHours: Math.round(ageHours),
      queueReason: reasons.length ? reasons.join(', ') : 'On track',
      score: Math.round(score * 10) / 10,
      createdAt: s.createdAt.toISOString(),
    };
  });

  return items.sort((a, b) => b.score - a.score);
}




