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

/**
 * OCR auto-fill — extracts structured fields from a photographed document
 * (driver's license, insurance card, VIN plate) so the customer doesn't have
 * to type them by hand. Same swappable-driver pattern as AI triage: a
 * zero-config "rules" fallback (no extraction, just typed nulls) and a real
 * OpenAI Vision driver when `OPENAI_API_KEY` is set.
 */
export const ocrDocumentKind = z.enum(['license', 'insurance_card', 'vin']);
export type OcrDocumentKind = z.infer<typeof ocrDocumentKind>;

/** Expected field names per document type — the shape the UI can render. */
export const OCR_FIELD_TEMPLATES: Record<OcrDocumentKind, string[]> = {
  license: ['fullName', 'licenseNumber', 'state', 'expirationDate'],
  insurance_card: ['companyName', 'policyNumber', 'groupNumber', 'memberName'],
  vin: ['vin'],
};

export interface OcrExtraction {
  documentType: OcrDocumentKind;
  /** Extracted field name → value (null if illegible or not present). */
  fields: Record<string, string | null>;
  confidence: 'low' | 'medium' | 'high';
  generatedBy: 'openai' | 'rules';
  generatedAt: string;
}


