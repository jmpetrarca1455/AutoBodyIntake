import { z } from 'zod';

/**
 * Customer status-update communications — the "AI employee" that keeps
 * customers in the loop without staff having to draft every text/email by
 * hand. Two-way channel support (SMS today, email fallback) with a full
 * audit log per submission.
 */
export const statusMilestone = z.enum([
  'received',
  'in_review',
  'estimate_ready',
  'parts_ordered',
  'in_repair',
  'quality_check',
  'ready_for_pickup',
  'picked_up',
  'insurance_pending',
  'custom',
]);
export type StatusMilestone = z.infer<typeof statusMilestone>;

export const MILESTONE_LABELS: Record<StatusMilestone, string> = {
  received: 'Vehicle received',
  in_review: 'Under review',
  estimate_ready: 'Estimate ready',
  parts_ordered: 'Parts ordered',
  in_repair: 'In repair',
  quality_check: 'Quality check',
  ready_for_pickup: 'Ready for pickup',
  picked_up: 'Picked up',
  insurance_pending: 'Waiting on insurance',
  custom: 'Custom update',
};

export type CommunicationChannel = 'sms' | 'email' | 'note' | 'call';
export type CommunicationDirection = 'outbound' | 'inbound' | 'internal';
export type CommunicationStatus = 'sent' | 'failed' | 'preview' | 'logged';

/**
 * Who a communication is with — lets the dashboard group/filter the audit
 * trail by conversation instead of one flat list (customer vs. the
 * insurance adjuster vs. a parts supplier vs. insurance directly, plus
 * internal notes for calls/events that didn't happen through the portal).
 */
export const recipientType = z.enum([
  'customer',
  'adjuster',
  'insurance',
  'parts_supplier',
  'internal',
  'other',
]);
export type RecipientType = z.infer<typeof recipientType>;
export const RECIPIENT_TYPE_LABELS: Record<RecipientType, string> = {
  customer: 'Customer',
  adjuster: 'Adjuster',
  insurance: 'Insurance company',
  parts_supplier: 'Parts supplier',
  internal: 'Internal note',
  other: 'Other',
};

export interface CommunicationLogEntry {
  id: string;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  recipientType: RecipientType;
  /** Free-text label for who this was with, e.g. "AutoZone — Main St", or
   * an adjuster's name, when the recipient isn't simply "the customer". */
  recipientLabel: string | null;
  milestone: StatusMilestone | null;
  subject: string | null;
  body: string;
  aiDrafted: boolean;
  status: CommunicationStatus;
  createdAt: string;
}

export interface StatusUpdateDraft {
  message: string;
  channel: CommunicationChannel;
  generatedBy: 'openai' | 'rules';
  generatedAt: string;
}

/**
 * AI-drafted follow-up to an insurance adjuster requesting claim status /
 * supplement approval — one of the most tedious recurring tasks for a
 * front-desk person, automated into a one-click draft they review and send.
 */
export interface AdjusterEmailDraft {
  subject: string;
  body: string;
  generatedBy: 'openai' | 'rules';
  generatedAt: string;
}

export const draftStatusUpdateSchema = z.object({
  milestone: statusMilestone,
  /** Optional extra context to steer the AI draft, e.g. "delayed 2 days — part backorder". */
  customInstruction: z.string().max(500).optional(),
});
export type DraftStatusUpdateInput = z.infer<typeof draftStatusUpdateSchema>;

export const sendStatusUpdateSchema = z.object({
  milestone: statusMilestone,
  message: z.string().min(1).max(1600),
  channel: z.enum(['sms', 'email']).optional(),
});
export type SendStatusUpdateInput = z.infer<typeof sendStatusUpdateSchema>;

export const sendAdjusterEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
  /** Freeform label shown in the communications log, e.g. the adjuster's name. */
  recipientLabel: z.string().max(200).optional(),
});
export type SendAdjusterEmailInput = z.infer<typeof sendAdjusterEmailSchema>;

/**
 * Manually log a communication that did NOT happen through this portal —
 * a phone call, an in-person conversation, a fax, anything staff want on
 * the record. No send happens; this just appends an audit-trail entry.
 */
export const logCommunicationNoteSchema = z.object({
  recipientType,
  recipientLabel: z.string().max(200).optional(),
  channel: z.enum(['call', 'note']).default('note'),
  body: z.string().min(1).max(10000),
  /** When the call/interaction actually happened, if backdating; defaults to now. */
  occurredAt: z.string().datetime().optional(),
});
export type LogCommunicationNoteInput = z.infer<typeof logCommunicationNoteSchema>;

/**
 * Send a freeform email to any non-customer recipient — a parts supplier,
 * the insurance company directly (as opposed to a specific adjuster), or
 * anyone else — with the same audit-trail logging as every other channel.
 */
export const sendGenericEmailSchema = z.object({
  recipientType: recipientType.exclude(['customer']),
  recipientLabel: z.string().max(200).optional(),
  to: z.string().email(),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
});
export type SendGenericEmailInput = z.infer<typeof sendGenericEmailSchema>;



