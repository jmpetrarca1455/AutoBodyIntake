import { prisma } from '../../lib/prisma.js';
import { checkEstimateGaps } from '../ai/estimate-suggestions.service.js';
import type {
  CreateEstimateLineItemInput,
  DamageAssessment,
  EstimateLineCategory,
  EstimateLineItemEntry,
  EstimateResponse,
  UpdateEstimateLineItemInput,
} from '@autobody/shared';

/**
 * Line-item repair estimate business logic. Every function is shop-scoped
 * (via the submission's shopId, never a client-supplied id). The `total`
 * column is computed and stored on write so reads never need to recompute.
 */

function computeTotal(category: EstimateLineCategory, quantity: number, unitPrice: number, laborHours?: number | null) {
  if (category === 'LABOR') {
    return (laborHours ?? 0) * unitPrice;
  }
  return quantity * unitPrice;
}

function toEntry(row: {
  id: string;
  category: string;
  description: string;
  partNumber: string | null;
  quantity: number;
  unitPrice: number;
  laborHours: number | null;
  total: number;
  createdAt: Date;
  updatedAt: Date;
}): EstimateLineItemEntry {
  return {
    id: row.id,
    category: row.category as EstimateLineCategory,
    description: row.description,
    partNumber: row.partNumber,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    laborHours: row.laborHours,
    total: row.total,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getScopedSubmission(shopId: string, submissionId: string) {
  return prisma.submission.findFirst({ where: { id: submissionId, shopId } });
}

function computeTotals(lines: EstimateLineItemEntry[]): EstimateResponse['totals'] {
  const byCategory: EstimateResponse['totals']['byCategory'] = {
    PARTS: 0,
    LABOR: 0,
    PAINT_MATERIALS: 0,
    SUBLET: 0,
    MISC: 0,
  };
  for (const line of lines) {
    byCategory[line.category] += line.total;
  }
  const grandTotal = Object.values(byCategory).reduce((sum, v) => sum + v, 0);
  return { byCategory, grandTotal };
}

export async function listEstimateLines(shopId: string, submissionId: string): Promise<EstimateResponse | null> {
  const submission = await getScopedSubmission(shopId, submissionId);
  if (!submission) return null;
  const rows = await prisma.estimateLineItem.findMany({
    where: { submissionId },
    orderBy: { createdAt: 'asc' },
  });
  const lines = rows.map(toEntry);
  const damageAssessment = submission.damageAssessment as unknown as DamageAssessment | null;
  const gapWarnings = checkEstimateGaps(
    damageAssessment,
    lines.map((l) => l.description),
  );
  return { lines, totals: computeTotals(lines), gapWarnings };
}

export async function createEstimateLine(
  shopId: string,
  submissionId: string,
  input: CreateEstimateLineItemInput,
): Promise<EstimateLineItemEntry | null> {
  const submission = await getScopedSubmission(shopId, submissionId);
  if (!submission) return null;

  const total = computeTotal(input.category, input.quantity, input.unitPrice, input.laborHours);
  const row = await prisma.estimateLineItem.create({
    data: {
      submissionId,
      category: input.category,
      description: input.description,
      partNumber: input.partNumber,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      laborHours: input.laborHours,
      total,
    },
  });
  return toEntry(row);
}

export async function updateEstimateLine(
  shopId: string,
  submissionId: string,
  lineId: string,
  input: UpdateEstimateLineItemInput,
): Promise<EstimateLineItemEntry | null> {
  const submission = await getScopedSubmission(shopId, submissionId);
  if (!submission) return null;

  const existing = await prisma.estimateLineItem.findFirst({ where: { id: lineId, submissionId } });
  if (!existing) return null;

  const category = (input.category ?? existing.category) as EstimateLineCategory;
  const quantity = input.quantity ?? existing.quantity;
  const unitPrice = input.unitPrice ?? existing.unitPrice;
  const laborHours = input.laborHours ?? existing.laborHours;
  const total = computeTotal(category, quantity, unitPrice, laborHours);

  const row = await prisma.estimateLineItem.update({
    where: { id: lineId },
    data: {
      category,
      description: input.description ?? existing.description,
      partNumber: input.partNumber ?? existing.partNumber,
      quantity,
      unitPrice,
      laborHours,
      total,
    },
  });
  return toEntry(row);
}

export async function deleteEstimateLine(
  shopId: string,
  submissionId: string,
  lineId: string,
): Promise<boolean> {
  const submission = await getScopedSubmission(shopId, submissionId);
  if (!submission) return false;
  const existing = await prisma.estimateLineItem.findFirst({ where: { id: lineId, submissionId } });
  if (!existing) return false;
  await prisma.estimateLineItem.delete({ where: { id: lineId } });
  return true;
}

/**
 * Gathers the submission's damage context and asks the AI layer to suggest
 * a starting set of estimate line items — the "AI does the estimator's
 * first pass" feature. Returns suggestions only; nothing is persisted
 * until staff explicitly accepts a suggestion (POST as a normal line).
 */
export async function getEstimateSuggestions(shopId: string, submissionId: string) {
  const submission = await getScopedSubmission(shopId, submissionId);
  if (!submission) return null;

  const existing = await prisma.estimateLineItem.findMany({ where: { submissionId }, select: { description: true } });
  const data = submission.data as unknown as { vehicle?: { damageDescription?: string } };

  const { suggestEstimateLines } = await import('../ai/estimate-suggestions.service.js');
  return suggestEstimateLines({
    vehicleInfo: submission.vehicleInfo,
    damageDescription: data.vehicle?.damageDescription,
    damageAssessment: submission.damageAssessment as unknown as DamageAssessment | null,
    existingDescriptions: existing.map((e) => e.description),
  });
}




