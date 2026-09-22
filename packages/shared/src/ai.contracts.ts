import { z } from 'zod';

/**
 * AI triage output — the beginning of the "AI employee" layer. Deterministic
 * today (rule-based), swappable for a real LLM later (see backend
 * ai.service.ts) without changing this contract.
 */
export const aiPriority = z.enum(['low', 'medium', 'high', 'urgent']);
export type AiPriority = z.infer<typeof aiPriority>;

export interface AiTriageSummary {
  /** One-paragraph human-readable summary of the submission. */
  summary: string;
  /** How urgently the shop should act. */
  priority: AiPriority;
  /** Why that priority was assigned. */
  priorityReason: string;
  /** Fields the customer left blank that the shop will likely need. */
  missingInfo: string[];
  /** The single most useful next action for shop staff to take. */
  suggestedNextAction: string;
  /** Which engine produced this (for transparency/debugging). */
  generatedBy: 'openai' | 'rules';
  generatedAt: string;
}

