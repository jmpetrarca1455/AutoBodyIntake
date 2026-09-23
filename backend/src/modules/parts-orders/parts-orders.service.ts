import { prisma } from '../../lib/prisma.js';
import type {
  CreatePartsOrderInput,
  PartsOrderEntry,
  PartsOrderStatus,
  PartsOrderWithSubmission,
  UpdatePartsOrderInput,
} from '@autobody/shared';

/**
 * Parts procurement/tracking business logic — every function shop-scoped
 * via the submission's shopId (or, for the cross-RO view, a direct shopId
 * filter joined through the submission relation).
 */

function toEntry(row: {
  id: string;
  submissionId: string;
  description: string;
  partNumber: string | null;
  supplier: string | null;
  status: string;
  cost: number | null;
  orderedAt: Date | null;
  expectedAt: Date | null;
  receivedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PartsOrderEntry {
  return {
    id: row.id,
    submissionId: row.submissionId,
    description: row.description,
    partNumber: row.partNumber,
    supplier: row.supplier,
    status: row.status as PartsOrderStatus,
    cost: row.cost,
    orderedAt: row.orderedAt?.toISOString() ?? null,
    expectedAt: row.expectedAt?.toISOString() ?? null,
    receivedAt: row.receivedAt?.toISOString() ?? null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getScopedSubmission(shopId: string, submissionId: string) {
  return prisma.submission.findFirst({ where: { id: submissionId, shopId } });
}

export async function listPartsOrders(shopId: string, submissionId: string): Promise<PartsOrderEntry[] | null> {
  const submission = await getScopedSubmission(shopId, submissionId);
  if (!submission) return null;
  const rows = await prisma.partsOrder.findMany({ where: { submissionId }, orderBy: { createdAt: 'asc' } });
  return rows.map(toEntry);
}

/** Shop-wide view across every open repair order — for the front-desk
 * "everything on order right now" screen. Excludes RETURNED/INSTALLED by
 * default so completed/dead parts don't clutter the active view. */
export async function listShopPartsOrders(shopId: string): Promise<PartsOrderWithSubmission[]> {
  const rows = await prisma.partsOrder.findMany({
    where: {
      submission: { shopId },
      status: { notIn: ['INSTALLED', 'RETURNED'] },
    },
    orderBy: { createdAt: 'desc' },
    include: { submission: { select: { customerName: true, vehicleInfo: true } } },
  });
  return rows.map((row) => ({
    ...toEntry(row),
    customerName: row.submission.customerName,
    vehicleInfo: row.submission.vehicleInfo,
  }));
}

export async function createPartsOrder(
  shopId: string,
  submissionId: string,
  input: CreatePartsOrderInput,
): Promise<PartsOrderEntry | null> {
  const submission = await getScopedSubmission(shopId, submissionId);
  if (!submission) return null;

  const row = await prisma.partsOrder.create({
    data: {
      submissionId,
      description: input.description,
      partNumber: input.partNumber,
      supplier: input.supplier,
      status: input.status ?? 'NEEDED',
      cost: input.cost,
      orderedAt: input.orderedAt ? new Date(input.orderedAt) : undefined,
      expectedAt: input.expectedAt ? new Date(input.expectedAt) : undefined,
      receivedAt: input.receivedAt ? new Date(input.receivedAt) : undefined,
      notes: input.notes,
    },
  });
  return toEntry(row);
}

export async function updatePartsOrder(
  shopId: string,
  submissionId: string,
  orderId: string,
  input: UpdatePartsOrderInput,
): Promise<PartsOrderEntry | null> {
  const submission = await getScopedSubmission(shopId, submissionId);
  if (!submission) return null;
  const existing = await prisma.partsOrder.findFirst({ where: { id: orderId, submissionId } });
  if (!existing) return null;

  const row = await prisma.partsOrder.update({
    where: { id: orderId },
    data: {
      description: input.description ?? existing.description,
      partNumber: input.partNumber ?? existing.partNumber,
      supplier: input.supplier ?? existing.supplier,
      status: input.status ?? existing.status,
      cost: input.cost ?? existing.cost,
      ...(input.orderedAt !== undefined ? { orderedAt: input.orderedAt ? new Date(input.orderedAt) : null } : {}),
      ...(input.expectedAt !== undefined ? { expectedAt: input.expectedAt ? new Date(input.expectedAt) : null } : {}),
      ...(input.receivedAt !== undefined ? { receivedAt: input.receivedAt ? new Date(input.receivedAt) : null } : {}),
      notes: input.notes ?? existing.notes,
    },
  });
  return toEntry(row);
}

export async function deletePartsOrder(shopId: string, submissionId: string, orderId: string): Promise<boolean> {
  const submission = await getScopedSubmission(shopId, submissionId);
  if (!submission) return false;
  const existing = await prisma.partsOrder.findFirst({ where: { id: orderId, submissionId } });
  if (!existing) return false;
  await prisma.partsOrder.delete({ where: { id: orderId } });
  return true;
}

