import { z } from 'zod';

/**
 * Line-item repair estimate contracts — the shop's REAL cost estimate
 * (parts/labor/paint materials/sublet/misc), distinct from the AI's rough
 * triage damage-assessment range in `estimate.contracts.ts`. This is the
 * CCC-ONE-style "Estimating" module: a running total the shop builds up
 * line by line as they scope the repair.
 */
export const estimateLineCategory = z.enum(['PARTS', 'LABOR', 'PAINT_MATERIALS', 'SUBLET', 'MISC']);
export type EstimateLineCategory = z.infer<typeof estimateLineCategory>;

export const ESTIMATE_CATEGORY_LABELS: Record<EstimateLineCategory, string> = {
  PARTS: 'Parts',
  LABOR: 'Labor',
  PAINT_MATERIALS: 'Paint & materials',
  SUBLET: 'Sublet (outsourced work)',
  MISC: 'Miscellaneous',
};

export const createEstimateLineItemSchema = z.object({
  category: estimateLineCategory,
  description: z.string().min(1, 'Description is required').max(300),
  partNumber: z.string().max(100).optional(),
  quantity: z.coerce.number().positive().default(1),
  /** Unit price for PARTS/MISC/SUBLET, or hourly rate for LABOR. */
  unitPrice: z.coerce.number().nonnegative().default(0),
  /** Hours — LABOR category only. */
  laborHours: z.coerce.number().nonnegative().optional(),
});
export type CreateEstimateLineItemInput = z.infer<typeof createEstimateLineItemSchema>;

export const updateEstimateLineItemSchema = createEstimateLineItemSchema.partial();
export type UpdateEstimateLineItemInput = z.infer<typeof updateEstimateLineItemSchema>;

export interface EstimateLineItemEntry {
  id: string;
  category: EstimateLineCategory;
  description: string;
  partNumber: string | null;
  quantity: number;
  unitPrice: number;
  laborHours: number | null;
  total: number;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateTotals {
  byCategory: Record<EstimateLineCategory, number>;
  grandTotal: number;
}

export interface EstimateResponse {
  lines: EstimateLineItemEntry[];
  totals: EstimateTotals;
}

