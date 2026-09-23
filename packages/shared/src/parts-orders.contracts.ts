import { z } from 'zod';

/**
 * Parts procurement/tracking contracts — the #1 cycle-time bottleneck in
 * collision repair is waiting on parts, so tracking each part's status
 * from "needed" through "installed" (CCC ONE's Parts module) is a vital
 * shop-management feature independent of the cost estimate line items.
 */
export const partsOrderStatus = z.enum([
  'NEEDED',
  'ORDERED',
  'BACKORDERED',
  'RECEIVED',
  'INSTALLED',
  'RETURNED',
]);
export type PartsOrderStatus = z.infer<typeof partsOrderStatus>;

export const PARTS_ORDER_STATUS_LABELS: Record<PartsOrderStatus, string> = {
  NEEDED: 'Needed',
  ORDERED: 'Ordered',
  BACKORDERED: 'Backordered',
  RECEIVED: 'Received',
  INSTALLED: 'Installed',
  RETURNED: 'Returned',
};

export const createPartsOrderSchema = z.object({
  description: z.string().min(1, 'Description is required').max(300),
  partNumber: z.string().max(100).optional(),
  supplier: z.string().max(200).optional(),
  status: partsOrderStatus.optional(),
  cost: z.coerce.number().nonnegative().optional(),
  orderedAt: z.string().datetime().optional(),
  expectedAt: z.string().datetime().optional(),
  receivedAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreatePartsOrderInput = z.infer<typeof createPartsOrderSchema>;

export const updatePartsOrderSchema = createPartsOrderSchema.partial();
export type UpdatePartsOrderInput = z.infer<typeof updatePartsOrderSchema>;

export interface PartsOrderEntry {
  id: string;
  submissionId: string;
  description: string;
  partNumber: string | null;
  supplier: string | null;
  status: PartsOrderStatus;
  cost: number | null;
  orderedAt: string | null;
  expectedAt: string | null;
  receivedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Shop-wide view row — includes enough submission context to identify
 * which repair order a part belongs to from the cross-RO Parts screen. */
export interface PartsOrderWithSubmission extends PartsOrderEntry {
  customerName: string;
  vehicleInfo: string | null;
}

