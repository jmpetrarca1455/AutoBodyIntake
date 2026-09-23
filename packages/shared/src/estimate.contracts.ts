import { z } from 'zod';

/**
 * AI damage assessment — analyzes a submission's damage photos (+ the
 * customer's written description) to give the shop an instant, rough
 * read on severity and scope *before* an estimator ever looks at the car.
 * This is the "nuanced AI" differentiator: competitors' intake tools just
 * collect photos, they don't triage them.
 *
 * Same swappable-driver pattern as the rest of the AI layer: a deterministic
 * "rules" fallback (keyword/photo-count heuristics, always available) and a
 * real OpenAI Vision driver when `OPENAI_API_KEY` is set. Numbers are
 * DELIBERATELY wide/conservative and always carry a disclaimer — this is a
 * triage aid for staff, never a substitute for a certified estimate.
 */
export const damageSeverity = z.enum(['minor', 'moderate', 'severe', 'total_loss_likely']);
export type DamageSeverity = z.infer<typeof damageSeverity>;

export interface DamageAssessment {
  severity: DamageSeverity;
  /** e.g. ["front bumper", "left headlight", "hood"] */
  affectedAreas: string[];
  /** Plain-English read on what the repair likely involves. */
  repairComplexity: string;
  estimatedLaborHours: { min: number; max: number };
  estimatedCostRange: { min: number; max: number; currency: string };
  /** e.g. "Likely repairable" / "Get a frame-damage inspection before quoting" */
  recommendation: string;
  /** Always shown alongside the numbers — this is a triage aid, not a quote. */
  disclaimer: string;
  confidence: 'low' | 'medium' | 'high';
  generatedBy: 'openai' | 'rules';
  generatedAt: string;
}

