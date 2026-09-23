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

export type CommunicationChannel = 'sms' | 'email';
export type CommunicationDirection = 'outbound' | 'inbound';
export type CommunicationStatus = 'sent' | 'failed' | 'preview';

export interface CommunicationLogEntry {
  id: string;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
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
});
export type SendAdjusterEmailInput = z.infer<typeof sendAdjusterEmailSchema>;

