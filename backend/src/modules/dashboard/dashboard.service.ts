import { prisma } from '../../lib/prisma.js';
import { config } from '../../config/index.js';
import { generateTriageSummary } from '../ai/ai.service.js';
import { assessDamage } from '../ai/estimate.service.js';
import { generateShopDigest } from '../ai/digest.service.js';
import { listShopPartsOrders } from '../parts-orders/parts-orders.service.js';
import { buildStorageKey, storage } from '../storage/storage.service.js';
import type {
  CreateIntakeInput,
  AiTriageSummary,
  AttachmentKind,
  QueueItem,
  ShopDigest,
  SuggestedPickupDate,
  StaffUpdateSubmissionInput,
} from '@autobody/shared';
import { buildVehicleSummary } from '@autobody/shared';
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

/**
 * Every submission with a scheduled drop-off or pickup, soonest first —
 * the shop-wide appointment view (CCC ONE's Scheduling module, scoped down
 * to what an independent shop needs: just a sorted list, no bay/tech
 * capacity planning yet).
 */
export async function getSchedule(shopId: string) {
  return prisma.submission.findMany({
    where: {
      shopId,
      OR: [{ dropoffScheduledAt: { not: null } }, { pickupScheduledAt: { not: null } }],
    },
    orderBy: [{ dropoffScheduledAt: 'asc' }, { pickupScheduledAt: 'asc' }],
  });
}

/**
 * Staff "edit customer file" — shallow-merges the same field groups as the
 * customer-facing update (contact/insurance/license/vehicle/rental/claim)
 * and optionally moves the submission's lifecycle `status`. Also refreshes
 * the promoted summary columns (customerName, vehicleInfo, etc.) so list
 * views stay consistent with the edited data.
 */
export async function updateSubmission(
  shopId: string,
  submissionId: string,
  input: StaffUpdateSubmissionInput,
) {
  const existing = await prisma.submission.findFirst({ where: { id: submissionId, shopId } });
  if (!existing) return null;

  const current = existing.data as unknown as CreateIntakeInput;
  const merged: CreateIntakeInput = {
    contact: { ...current.contact, ...input.contact },
    insurance: { ...current.insurance, ...input.insurance },
    license: { ...current.license, ...input.license },
    vehicle: { ...current.vehicle, ...input.vehicle },
    rental: { ...current.rental, ...input.rental },
    claim: { ...current.claim, ...input.claim },
  };

  return prisma.submission.update({
    where: { id: submissionId },
    data: {
      data: merged as unknown as Prisma.InputJsonValue,
      ...(input.status ? { status: input.status } : {}),
      customerName: merged.contact?.fullName ?? existing.customerName,
      customerEmail: merged.contact?.email ?? null,
      customerPhone: merged.contact?.phone ?? null,
      vehicleInfo: buildVehicleSummary(merged.vehicle) ?? existing.vehicleInfo,
      claimNumber: merged.insurance?.claimNumber ?? existing.claimNumber,
      ...(input.dropoffScheduledAt !== undefined
        ? { dropoffScheduledAt: input.dropoffScheduledAt ? new Date(input.dropoffScheduledAt) : null }
        : {}),
      ...(input.pickupScheduledAt !== undefined
        ? { pickupScheduledAt: input.pickupScheduledAt ? new Date(input.pickupScheduledAt) : null }
        : {}),
    },
    include: { attachments: true },
  });
}

/**
 * Staff upload/replace an attachment — adds a new Attachment row for the
 * given kind (insurance card, license, registration, estimate document,
 * etc.). Never deletes/overwrites an existing row, so replacing a photo
 * keeps the old one in history (visible/removable via deleteAttachment).
 */
export interface StaffUploadAttachmentInput {
  kind: AttachmentKind;
  fileName: string;
  contentType: string;
  body: Buffer;
}

export async function uploadStaffAttachment(
  shopId: string,
  submissionId: string,
  input: StaffUploadAttachmentInput,
) {
  const submission = await prisma.submission.findFirst({ where: { id: submissionId, shopId } });
  if (!submission) return null;

  const attachment = await prisma.attachment.create({
    data: {
      submissionId,
      kind: input.kind,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.body.byteLength,
    },
  });

  const key = buildStorageKey({
    shopId,
    submissionId,
    attachmentId: attachment.id,
    fileName: input.fileName,
  });
  const stored = await storage.put(key, input.body, input.contentType);

  return prisma.attachment.update({
    where: { id: attachment.id },
    data: { storageKey: stored.key, sizeBytes: stored.sizeBytes },
  });
}

/** Remove an attachment uploaded in error. Shop-scoped via the submission. */
export async function deleteAttachment(
  shopId: string,
  submissionId: string,
  attachmentId: string,
): Promise<boolean> {
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, submissionId, submission: { shopId } },
  });
  if (!attachment) return false;
  await prisma.attachment.delete({ where: { id: attachmentId } });
  return true;
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

/**
 * Basic shop KPI report — cycle time, status breakdown, average estimate
 * value, and outstanding parts orders. All computed from data we already
 * store; no extra tracking columns needed for this first cut (CCC ONE's
 * "Insights"/analytics module, scoped down to what a small shop actually
 * looks at day to day).
 */
export interface ShopReport {
  statusBreakdown: Record<string, number>;
  avgCycleTimeHours: number | null;
  avgEstimateTotal: number | null;
  outstandingPartsOrders: number;
  last30DaysVolume: number;
}

export async function getShopReports(shopId: string): Promise<ShopReport> {
  const submissions = await prisma.submission.findMany({
    where: { shopId },
    select: { status: true, createdAt: true, emailedAt: true },
  });

  const statusBreakdown: Record<string, number> = {};
  let cycleTimeSum = 0;
  let cycleTimeCount = 0;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let last30DaysVolume = 0;

  for (const s of submissions) {
    statusBreakdown[s.status] = (statusBreakdown[s.status] ?? 0) + 1;
    if (s.emailedAt) {
      cycleTimeSum += (s.emailedAt.getTime() - s.createdAt.getTime()) / (60 * 60 * 1000);
      cycleTimeCount += 1;
    }
    if (s.createdAt >= thirtyDaysAgo) last30DaysVolume += 1;
  }

  const lineTotals = await prisma.estimateLineItem.groupBy({
    by: ['submissionId'],
    where: { submission: { shopId } },
    _sum: { total: true },
  });
  const avgEstimateTotal =
    lineTotals.length > 0
      ? lineTotals.reduce((sum, row) => sum + (row._sum.total ?? 0), 0) / lineTotals.length
      : null;

  const outstandingPartsOrders = await prisma.partsOrder.count({
    where: { submission: { shopId }, status: { notIn: ['INSTALLED', 'RETURNED'] } },
  });

  return {
    statusBreakdown,
    avgCycleTimeHours: cycleTimeCount > 0 ? Math.round((cycleTimeSum / cycleTimeCount) * 10) / 10 : null,
    avgEstimateTotal: avgEstimateTotal !== null ? Math.round(avgEstimateTotal * 100) / 100 : null,
    outstandingPartsOrders,
    last30DaysVolume,
  };
}

/**
 * AI Daily Digest — combines the Smart Queue, KPI report, and outstanding
 * parts into a short narrative + action list. See ai/digest.service.ts.
 */
export async function getDigest(shopId: string): Promise<ShopDigest> {
  const [queue, report, outstandingParts] = await Promise.all([
    getSmartQueue(shopId),
    getShopReports(shopId),
    listShopPartsOrders(shopId),
  ]);
  return generateShopDigest({ queue, report, outstandingParts });
}

/**
 * Suggested pickup/completion date — rule-based (no AI cost): sums labor
 * hours from the estimate (falling back to the AI damage assessment's
 * range when no estimate lines exist yet), assumes a conservative
 * productive-hours-per-day shop capacity, adds a buffer for any
 * backordered parts on this RO, and adds a small queue-congestion buffer
 * based on how many other active ROs are ahead of it. Always a *suggestion*
 * staff can override — never auto-applied.
 */
const PRODUCTIVE_HOURS_PER_DAY = 6;
const DAYS_PER_BACKORDERED_PART = 3;

export async function suggestPickupDate(shopId: string, submissionId: string): Promise<SuggestedPickupDate | null> {
  const submission = await prisma.submission.findFirst({ where: { id: submissionId, shopId } });
  if (!submission) return null;

  const lines = await prisma.estimateLineItem.findMany({ where: { submissionId, category: 'LABOR' } });
  let laborHours = lines.reduce((sum, l) => sum + (l.laborHours ?? 0), 0);
  if (laborHours === 0) {
    const damage = submission.damageAssessment as unknown as { estimatedLaborHours?: { min: number; max: number } } | null;
    if (damage?.estimatedLaborHours) {
      laborHours = (damage.estimatedLaborHours.min + damage.estimatedLaborHours.max) / 2;
    }
  }
  if (laborHours === 0) laborHours = 4; // conservative default for an untriaged repair

  const backorderedCount = await prisma.partsOrder.count({
    where: { submissionId, status: 'BACKORDERED' },
  });

  const activeAhead = await prisma.submission.count({
    where: {
      shopId,
      status: { in: ['RECEIVED', 'IN_REVIEW', 'ESTIMATE_READY', 'IN_REPAIR'] },
      createdAt: { lt: submission.createdAt },
    },
  });

  const repairDays = Math.max(1, Math.ceil(laborHours / PRODUCTIVE_HOURS_PER_DAY));
  const backorderBufferDays = backorderedCount * DAYS_PER_BACKORDERED_PART;
  const queueBufferDays = Math.min(5, Math.floor(activeAhead / 2)); // shared shop capacity, capped

  const totalDays = repairDays + backorderBufferDays + queueBufferDays;
  const suggestedDate = new Date(Date.now() + totalDays * 24 * 60 * 60 * 1000);

  const reasonParts = [`${laborHours.toFixed(1)} labor hour(s) at ~${PRODUCTIVE_HOURS_PER_DAY} productive hrs/day (${repairDays}d)`];
  if (backorderedCount > 0) reasonParts.push(`+${backorderBufferDays}d for ${backorderedCount} backordered part(s)`);
  if (queueBufferDays > 0) reasonParts.push(`+${queueBufferDays}d for ${activeAhead} job(s) ahead in queue`);

  return {
    suggestedDate: suggestedDate.toISOString(),
    reasoning: reasonParts.join(', '),
    estimatedLaborHours: Math.round(laborHours * 10) / 10,
    blockedByBackorderedParts: backorderedCount > 0,
  };
}















