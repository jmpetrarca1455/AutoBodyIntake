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

/**
 * Handle an inbound SMS (customer reply) from Twilio's webhook. Matches the
 * sender's phone number to the most recent submission with that
 * `customerPhone` (across shops — a phone number isn't shop-scoped at the
 * carrier level) and appends it to that submission's communications log so
 * staff see two-way conversations in one place.
 *
 * Normalizes phone numbers to their last 10 digits for matching, since
 * customers may have typed "(555) 123-4567" at intake while Twilio sends
 * "+15551234567" — exact string matching would silently drop every reply.
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

export async function recordInboundSms(
  fromPhone: string,
  body: string,
): Promise<{ submissionId: string; shopId: string } | null> {
  const normalized = normalizePhone(fromPhone);
  if (!normalized) return null;

  // customerPhone isn't indexed for suffix matching, so pull recent
  // submissions with any phone on file and match in application code. Fine
  // at pilot scale; revisit with a normalized-phone column if this becomes
  // a hot path at larger scale.
  const candidates = await prisma.submission.findMany({
    where: { customerPhone: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, shopId: true, customerPhone: true },
  });
  const match = candidates.find((c) => normalizePhone(c.customerPhone ?? '') === normalized);
  if (!match) return null;

  await prisma.communicationLog.create({
    data: {
      submissionId: match.id,
      channel: 'sms',
      direction: 'inbound',
      milestone: null,
      body,
      aiDrafted: false,
      status: 'sent',
    },
  });

  return { submissionId: match.id, shopId: match.shopId };
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

  const data = submission.data as unknown as CreateIntakeInput;
  const smsConsent = data.contact?.smsConsent === true;

  // Prefer SMS (faster, higher open rate) when we have a phone number AND
  // the customer opted in (TCPA — never text without explicit consent),
  // and the caller didn't explicitly force email; fall back to email.
  let channel: 'sms' | 'email' = input.channel ?? (submission.customerPhone && smsConsent ? 'sms' : 'email');
  if (channel === 'sms' && !smsConsent) {
    // Caller explicitly asked for SMS but the customer never consented —
    // fail closed rather than silently texting someone who opted out/never in.
    if (submission.customerEmail) {
      channel = 'email';
    } else {
      const row = await prisma.communicationLog.create({
        data: {
          submissionId,
          channel: 'sms',
          direction: 'outbound',
          milestone: input.milestone,
          body: input.message,
          aiDrafted: false,
          status: 'failed',
        },
      });
      return toEntry(row);
    }
  }

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



