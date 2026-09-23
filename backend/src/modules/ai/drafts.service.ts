import type { CreateIntakeInput } from '@autobody/shared';
import {
  MILESTONE_LABELS,
  type AdjusterEmailDraft,
  type StatusMilestone,
  type StatusUpdateDraft,
} from '@autobody/shared';
import { config, hasOpenAI } from '../../config/index.js';

/**
 * AI drafting for outbound communications — the "AI employee" writes the
 * first draft of every customer status update and adjuster follow-up so
 * staff only ever have to review/edit/send, never start from a blank page.
 * Same swappable-driver pattern (rules fallback / OpenAI) as the rest of
 * the AI layer.
 */
export interface DraftContext {
  shopName: string;
  customerName: string;
  vehicleInfo: string | null;
}

// ── Status update drafts ────────────────────────────────

const MILESTONE_TEMPLATES: Record<StatusMilestone, (ctx: DraftContext) => string> = {
  received: (ctx) =>
    `Hi ${firstName(ctx.customerName)}, this is ${ctx.shopName}. We've received your vehicle${
      ctx.vehicleInfo ? ` (${ctx.vehicleInfo})` : ''
    } and will begin the review shortly. We'll keep you posted!`,
  in_review: (ctx) =>
    `Hi ${firstName(ctx.customerName)}, ${ctx.shopName} here — we're currently reviewing the damage on your vehicle and will follow up with next steps soon.`,
  estimate_ready: (ctx) =>
    `Hi ${firstName(ctx.customerName)}, your repair estimate is ready! Please give ${ctx.shopName} a call at your convenience to go over the details.`,
  parts_ordered: (ctx) =>
    `Hi ${firstName(ctx.customerName)}, an update from ${ctx.shopName}: we've ordered the parts needed for your repair. We'll let you know once they arrive and work begins.`,
  in_repair: (ctx) =>
    `Hi ${firstName(ctx.customerName)}, your vehicle is now in the repair process at ${ctx.shopName}. We'll notify you as soon as it's ready.`,
  quality_check: (ctx) =>
    `Hi ${firstName(ctx.customerName)}, great news — your vehicle has finished repairs and is now going through our final quality check at ${ctx.shopName}.`,
  ready_for_pickup: (ctx) =>
    `Hi ${firstName(ctx.customerName)}, your vehicle is ready for pickup at ${ctx.shopName}! Let us know when works for you.`,
  picked_up: (ctx) =>
    `Hi ${firstName(ctx.customerName)}, thanks for picking up your vehicle from ${ctx.shopName}! Please reach out if you have any questions about the repair.`,
  insurance_pending: (ctx) =>
    `Hi ${firstName(ctx.customerName)}, this is ${ctx.shopName} — we're currently waiting on your insurance company to approve the repair. We'll update you as soon as we hear back.`,
  custom: (ctx) => `Hi ${firstName(ctx.customerName)}, this is ${ctx.shopName} with an update on your vehicle.`,
};

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || 'there';
}

function draftStatusUpdateWithRules(
  milestone: StatusMilestone,
  ctx: DraftContext,
  customInstruction?: string,
): StatusUpdateDraft {
  let message = MILESTONE_TEMPLATES[milestone](ctx);
  if (customInstruction) {
    message += ` (${customInstruction})`;
  }
  return {
    message,
    channel: 'sms',
    generatedBy: 'rules',
    generatedAt: new Date().toISOString(),
  };
}

async function draftStatusUpdateWithOpenAI(
  milestone: StatusMilestone,
  ctx: DraftContext,
  customInstruction?: string,
): Promise<StatusUpdateDraft> {
  const prompt = `Write a short, warm, professional SMS (under 300 characters) from a collision repair shop called "${ctx.shopName}" to their customer "${ctx.customerName}" about their vehicle${
    ctx.vehicleInfo ? ` (${ctx.vehicleInfo})` : ''
  }. The status update is: "${MILESTONE_LABELS[milestone]}".${
    customInstruction ? ` Additional context to include: ${customInstruction}` : ''
  } Respond with ONLY the message text, no quotes, no signature.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: config.AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed: ${res.status}`);
  const body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const message = body.choices[0]?.message.content?.trim();
  if (!message) throw new Error('OpenAI response had no content');

  return { message, channel: 'sms', generatedBy: 'openai', generatedAt: new Date().toISOString() };
}

export async function draftStatusUpdate(
  milestone: StatusMilestone,
  ctx: DraftContext,
  customInstruction?: string,
): Promise<StatusUpdateDraft> {
  if (hasOpenAI) {
    try {
      return await draftStatusUpdateWithOpenAI(milestone, ctx, customInstruction);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[drafts] OpenAI status-update draft failed, falling back to rules:', (err as Error).message);
    }
  }
  return draftStatusUpdateWithRules(milestone, ctx, customInstruction);
}

// ── Adjuster follow-up email drafts ─────────────────────

export interface AdjusterDraftInput {
  shopName: string;
  customerName: string;
  vehicleInfo: string | null;
  claimNumber?: string;
  policyNumber?: string;
  insuranceCompany?: string;
  adjusterName?: string;
  attachmentCount: number;
  daysSinceReceived: number;
}

function draftAdjusterEmailWithRules(input: AdjusterDraftInput): AdjusterEmailDraft {
  const greeting = input.adjusterName ? `Dear ${input.adjusterName},` : 'Hello,';
  const subject = `Follow-up on claim${input.claimNumber ? ` #${input.claimNumber}` : ''} — ${input.customerName}${
    input.vehicleInfo ? ` (${input.vehicleInfo})` : ''
  }`;
  const body = `${greeting}

I'm writing from ${input.shopName} regarding the collision repair for your insured, ${input.customerName}${
    input.vehicleInfo ? `, driving a ${input.vehicleInfo}` : ''
  }.${input.claimNumber ? ` Claim number: ${input.claimNumber}.` : ''}${
    input.policyNumber ? ` Policy number: ${input.policyNumber}.` : ''
  }

The vehicle has been with us for ${input.daysSinceReceived} day(s), and we have ${input.attachmentCount} supporting photo(s)/document(s) on file. Could you please provide an update on the claim status, or let us know if anything further is needed from our side to move forward with the repair approval?

Thank you for your help — please don't hesitate to reach out with any questions.

Best regards,
${input.shopName}`;

  return { subject, body, generatedBy: 'rules', generatedAt: new Date().toISOString() };
}

async function draftAdjusterEmailWithOpenAI(input: AdjusterDraftInput): Promise<AdjusterEmailDraft> {
  const prompt = `Write a professional, concise follow-up email from a collision repair shop ("${input.shopName}") to an insurance adjuster${
    input.adjusterName ? ` named ${input.adjusterName}` : ''
  }, requesting a status update on a claim so the repair can proceed. Details: customer "${input.customerName}", vehicle ${
    input.vehicleInfo ?? 'unspecified'
  }, claim number ${input.claimNumber ?? 'unknown'}, policy number ${input.policyNumber ?? 'unknown'}, insurer ${
    input.insuranceCompany ?? 'unknown'
  }, vehicle has been at the shop for ${input.daysSinceReceived} day(s), ${input.attachmentCount} photo(s)/document(s) on file. Respond with ONLY a JSON object: {"subject": string, "body": string}.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: config.AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed: ${res.status}`);
  const body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const content = body.choices[0]?.message.content;
  if (!content) throw new Error('OpenAI response had no content');
  const parsed = JSON.parse(content) as { subject: string; body: string };

  return { ...parsed, generatedBy: 'openai', generatedAt: new Date().toISOString() };
}

export async function draftAdjusterEmail(input: AdjusterDraftInput): Promise<AdjusterEmailDraft> {
  if (hasOpenAI) {
    try {
      return await draftAdjusterEmailWithOpenAI(input);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[drafts] OpenAI adjuster-email draft failed, falling back to rules:', (err as Error).message);
    }
  }
  return draftAdjusterEmailWithRules(input);
}

// ── Generic recipient email drafts (parts supplier / insurance-direct) ──

export interface RecipientEmailDraftInput {
  shopName: string;
  customerName: string;
  vehicleInfo: string | null;
  recipientLabel?: string;
  purpose: 'parts_quote' | 'parts_order_status' | 'insurance_update' | 'general';
  context?: string;
  claimNumber?: string;
}

const PURPOSE_INTENT: Record<RecipientEmailDraftInput['purpose'], string> = {
  parts_quote: 'request a price quote and availability for a specific part',
  parts_order_status: 'ask for a status/ETA update on a part that was already ordered',
  insurance_update: 'ask the insurance company directly for a status update on a claim/repair approval',
  general: 'send a general professional message',
};

function draftRecipientEmailWithRules(input: RecipientEmailDraftInput): AdjusterEmailDraft {
  const greeting = input.recipientLabel ? `Hello ${input.recipientLabel},` : 'Hello,';
  const vehicleLine = input.vehicleInfo ? ` (${input.vehicleInfo})` : '';
  const subjectBase =
    input.purpose === 'parts_quote'
      ? `Parts quote request — ${input.customerName}${vehicleLine}`
      : input.purpose === 'parts_order_status'
        ? `Order status check — ${input.customerName}${vehicleLine}`
        : input.purpose === 'insurance_update'
          ? `Claim status request${input.claimNumber ? ` — claim #${input.claimNumber}` : ''} — ${input.customerName}`
          : `Message regarding ${input.customerName}${vehicleLine}`;

  const body = `${greeting}

I'm reaching out from ${input.shopName} to ${PURPOSE_INTENT[input.purpose]} for our customer ${input.customerName}${
    input.vehicleInfo ? `, driving a ${input.vehicleInfo}` : ''
  }.${input.claimNumber ? ` Claim number: ${input.claimNumber}.` : ''}${
    input.context ? `\n\n${input.context}` : ''
  }

Please let us know at your earliest convenience — we appreciate your help getting this repair moving.

Best regards,
${input.shopName}`;

  return { subject: subjectBase, body, generatedBy: 'rules', generatedAt: new Date().toISOString() };
}

async function draftRecipientEmailWithOpenAI(input: RecipientEmailDraftInput): Promise<AdjusterEmailDraft> {
  const prompt = `Write a short, professional business email from a collision repair shop ("${input.shopName}") to ${
    input.recipientLabel ? `"${input.recipientLabel}"` : 'a business contact'
  }. Purpose: ${PURPOSE_INTENT[input.purpose]}. Customer: "${input.customerName}", vehicle: ${
    input.vehicleInfo ?? 'unspecified'
  }.${input.claimNumber ? ` Claim number: ${input.claimNumber}.` : ''}${
    input.context ? ` Additional context: ${input.context}` : ''
  } Respond with ONLY a JSON object: {"subject": string, "body": string}.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: config.AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed: ${res.status}`);
  const body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const content = body.choices[0]?.message.content;
  if (!content) throw new Error('OpenAI response had no content');
  const parsed = JSON.parse(content) as { subject: string; body: string };
  return { ...parsed, generatedBy: 'openai', generatedAt: new Date().toISOString() };
}

/**
 * AI-drafts an email to ANY recipient type (parts supplier, insurance
 * company direct, or general) — generalizes the adjuster-email pattern so
 * staff never start a parts-quote request or insurance-direct message from
 * a blank page either.
 */
export async function draftRecipientEmail(input: RecipientEmailDraftInput): Promise<AdjusterEmailDraft> {
  if (hasOpenAI) {
    try {
      return await draftRecipientEmailWithOpenAI(input);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[drafts] OpenAI recipient-email draft failed, falling back to rules:', (err as Error).message);
    }
  }
  return draftRecipientEmailWithRules(input);
}

// Re-export for callers that only need the type import path consolidated here.
export type { CreateIntakeInput };


