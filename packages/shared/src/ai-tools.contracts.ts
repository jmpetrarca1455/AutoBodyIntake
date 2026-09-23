import { z } from 'zod';

/**
 * "AI does the labor" layer — every place a human would otherwise have to
 * type/calculate/compose something from scratch, an AI (or, where a real
 * LLM adds no value over a free public data source / simple math, a
 * deterministic tool) does the first pass so staff only ever review and
 * click accept. Same swappable-driver pattern as the rest of the AI layer.
 */

// ── VIN decode (free NHTSA public API — no OpenAI needed, always on) ────
export interface VinDecodeResult {
  vin: string;
  found: boolean;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  bodyClass: string | null;
  driveType: string | null;
  engineCylinders: string | null;
  fuelType: string | null;
}

// ── AI-suggested estimate line items ─────────────────────────────────────
export const estimateLineCategoryForAi = z.enum(['PARTS', 'LABOR', 'PAINT_MATERIALS', 'SUBLET', 'MISC']);

export interface EstimateLineSuggestion {
  category: 'PARTS' | 'LABOR' | 'PAINT_MATERIALS' | 'SUBLET' | 'MISC';
  description: string;
  partNumber: string | null;
  quantity: number;
  unitPrice: number;
  laborHours: number | null;
  /** Short plain-English reason this line was suggested (shown to staff). */
  reasoning: string;
}

export interface SuggestEstimateLinesResponse {
  suggestions: EstimateLineSuggestion[];
  generatedBy: 'openai' | 'rules';
  generatedAt: string;
}

// ── Estimate gap-check (rule-based, free, always on) ─────────────────────
export interface EstimateGapCheck {
  /** Damage areas the AI/damage-assessment flagged that have no matching
   * estimate line yet — a safety net against under-quoting a repair. */
  missingAreas: string[];
}

// ── AI shop daily digest ──────────────────────────────────────────────────
export interface ShopDigest {
  /** One-line headline, e.g. "3 vehicles need attention today". */
  headline: string;
  /** 2-4 sentence narrative summary of the shop's current state. */
  narrative: string;
  /** Short bullet list of the most important things to do right now. */
  topPriorities: string[];
  /** Short bullet list of risks/blockers (backordered parts, stale claims). */
  watchouts: string[];
  generatedBy: 'openai' | 'rules';
  generatedAt: string;
}

// ── Suggested pickup/completion date (rule-based, free, always on) ───────
export interface SuggestedPickupDate {
  suggestedDate: string;
  reasoning: string;
  estimatedLaborHours: number;
  blockedByBackorderedParts: boolean;
}

// ── Generic AI email drafting (parts supplier / insurance-direct) ────────
export const emailDraftPurpose = z.enum(['parts_quote', 'parts_order_status', 'insurance_update', 'general']);
export type EmailDraftPurpose = z.infer<typeof emailDraftPurpose>;

export const draftRecipientEmailSchema = z.object({
  purpose: emailDraftPurpose,
  /** Freeform context, e.g. a specific part name or question to ask. */
  context: z.string().max(500).optional(),
  recipientLabel: z.string().max(200).optional(),
});
export type DraftRecipientEmailInput = z.infer<typeof draftRecipientEmailSchema>;

// ── Attachment auto-categorization suggestion ─────────────────────────────
export interface AttachmentKindSuggestion {
  suggestedKind: string;
  confidence: 'low' | 'medium' | 'high';
  generatedBy: 'openai' | 'rules';
}

