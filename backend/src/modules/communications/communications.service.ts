import type {
  AdjusterEmailDraft,
  CommunicationLogEntry,
  CreateIntakeInput,
  DraftStatusUpdateInput,
  SendAdjusterEmailInput,
  SendStatusUpdateInput,
  StatusUpdateDraft,
} from '@autobody/shared';
import { prisma } from '../../lib/prisma.js';
import { draftAdjusterEmail, draftStatusUpdate } from '../ai/drafts.service.js';
import { sendRawEmail } from '../email/email.service.js';
import { sendSms } from './sms.service.js';

/**
 * Business logic for outbound customer/adjuster communications. Every
 * function is scoped by shopId (never a client-supplied id) and every
 * send — successful or not — is logged to CommunicationLog for the
 * dashboard's audit trail.
 */

async function getScopedSubmission(shopId: string, submissionId: string) {
  return prisma.submission.findFirst({
    where: { id: submissionId, shopId },
    include: { attachments: true, shop: true },
  });
}

function toEntry(row: {
  id: string;
  channel: string;
  direction: string;
  milestone: string | null;
  subject: string | null;
  body: string;
  aiDrafted: boolean;
  status: string;
  createdAt: Date;
}): CommunicationLogEntry {
  return {
    id: row.id,
    channel: row.channel as CommunicationLogEntry['channel'],
    direction: row.direction as CommunicationLogEntry['direction'],
    milestone: row.milestone as CommunicationLogEntry['milestone'],
    subject: row.subject,
    body: row.body,
    aiDrafted: row.aiDrafted,
    status: row.status as CommunicationLogEntry['status'],
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listCommunications(
  shopId: string,
  submissionId: string,
): Promise<CommunicationLogEntry[] | null> {
  const submission = await getScopedSubmission(shopId, submissionId);
  if (!submission) return null;
  const rows = await prisma.communicationLog.findMany({
    where: { submissionId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toEntry);
}

// ── Status updates ───────────────────────────────────────

export async function draftStatusUpdateForSubmission(
  shopId: string,
  submissionId: string,
  input: DraftStatusUpdateInput,
): Promise<StatusUpdateDraft | null> {
  const submission = await getScopedSubmission(shopId, submissionId);
  if (!submission) return null;

  return draftStatusUpdate(
    input.milestone,
    {
      shopName: submission.shop.name,
      customerName: submission.customerName,
      vehicleInfo: submission.vehicleInfo,
    },
    input.customInstruction,
  );
}

export async function sendStatusUpdate(
  shopId: string,
  submissionId: string,
  input: SendStatusUpdateInput,
): Promise<CommunicationLogEntry | null> {
  const submission = await getScopedSubmission(shopId, submissionId);
  if (!submission) return null;

  // Prefer SMS (faster, higher open rate) when we have a phone number and
  // the caller didn't explicitly force email; fall back to email.
  const channel: 'sms' | 'email' =
    input.channel ?? (submission.customerPhone ? 'sms' : 'email');

  let status: 'sent' | 'failed' | 'preview' = 'sent';
  try {
    if (channel === 'sms') {
      if (!submission.customerPhone) throw new Error('No phone number on file for this customer.');
      const result = await sendSms(submission.customerPhone, input.message);
      status = result.driver === 'preview' ? 'preview' : 'sent';
    } else {
      if (!submission.customerEmail) throw new Error('No email on file for this customer.');
      const result = await sendRawEmail(
        submission.customerEmail,
        `Update on your repair — ${submission.shop.name}`,
        input.message,
      );
      status = result.driver === 'preview' ? 'preview' : 'sent';
    }
  } catch (err) {
    status = 'failed';
    const row = await prisma.communicationLog.create({
      data: {
        submissionId,
        channel,
        direction: 'outbound',
        milestone: input.milestone,
        body: input.message,
        aiDrafted: false,
        status,
      },
    });
    // eslint-disable-next-line no-console
    console.warn('[communications] send failed:', (err as Error).message);
    return toEntry(row);
  }

  const row = await prisma.communicationLog.create({
    data: {
      submissionId,
      channel,
      direction: 'outbound',
      milestone: input.milestone,
      body: input.message,
      aiDrafted: false,
      status,
    },
  });
  return toEntry(row);
}

// ── Adjuster follow-up emails ────────────────────────────

export async function draftAdjusterEmailForSubmission(
  shopId: string,
  submissionId: string,
): Promise<AdjusterEmailDraft | null> {
  const submission = await getScopedSubmission(shopId, submissionId);
  if (!submission) return null;

  const data = submission.data as unknown as CreateIntakeInput;
  const daysSinceReceived = Math.max(
    0,
    Math.floor((Date.now() - submission.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
  );

  return draftAdjusterEmail({
    shopName: submission.shop.name,
    customerName: submission.customerName,
    vehicleInfo: submission.vehicleInfo,
    claimNumber: submission.claimNumber ?? data.insurance?.claimNumber,
    policyNumber: data.insurance?.policyNumber,
    insuranceCompany: data.insurance?.companyName,
    adjusterName: data.insurance?.adjusterName,
    attachmentCount: submission.attachments.length,
    daysSinceReceived,
  });
}

export async function sendAdjusterEmail(
  shopId: string,
  submissionId: string,
  input: SendAdjusterEmailInput,
): Promise<CommunicationLogEntry | null> {
  const submission = await getScopedSubmission(shopId, submissionId);
  if (!submission) return null;

  let status: 'sent' | 'failed' | 'preview' = 'sent';
  try {
    const result = await sendRawEmail(input.to, input.subject, input.body);
    status = result.driver === 'preview' ? 'preview' : 'sent';
  } catch (err) {
    status = 'failed';
    // eslint-disable-next-line no-console
    console.warn('[communications] adjuster email send failed:', (err as Error).message);
  }

  const row = await prisma.communicationLog.create({
    data: {
      submissionId,
      channel: 'email',
      direction: 'outbound',
      milestone: null,
      subject: input.subject,
      body: input.body,
      aiDrafted: false,
      status,
    },
  });
  return toEntry(row);
}

