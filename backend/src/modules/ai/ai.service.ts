import type { AiTriageSummary, AiPriority } from '@autobody/shared';
import type { CreateIntakeInput } from '@autobody/shared';
import { config, hasOpenAI } from '../../config/index.js';

export interface TriageInput {
  data: CreateIntakeInput;
  attachmentCount: number;
}

/**
 * Rule-based triage — zero-config fallback (and a solid baseline even with
 * an LLM available). Looks for signals a busy front-desk person would use to
 * decide "how urgent is this / what's missing / what do I do first".
 */
function triageWithRules(input: TriageInput): AiTriageSummary {
  const { data, attachmentCount } = input;
  const missingInfo: string[] = [];

  if (!data.insurance?.companyName) missingInfo.push('Insurance company');
  if (!data.insurance?.policyNumber) missingInfo.push('Policy number');
  if (!data.vehicle?.vin) missingInfo.push('VIN');
  if (!data.vehicle?.licensePlate) missingInfo.push('License plate');
  if (!data.claim?.accidentDate) missingInfo.push('Accident date');
  if (attachmentCount === 0) missingInfo.push('Photos of the vehicle/damage');
  if (!data.contact.phone && !data.contact.email) missingInfo.push('A way to contact the customer');

  let priority: AiPriority = 'medium';
  let priorityReason = 'Standard intake with the usual amount of missing detail.';

  const noContactInfo = !data.contact.phone && !data.contact.email;
  const noInsurance = !data.insurance?.companyName && !data.insurance?.policyNumber;
  const otherPartyInvolved = Boolean(data.claim?.otherPartyInfo);
  const rentalUrgent = data.rental?.hasCoverage === 'yes';

  if (noContactInfo) {
    priority = 'urgent';
    priorityReason = 'No phone or email on file — the shop cannot reach this customer yet.';
  } else if (noInsurance && attachmentCount === 0) {
    priority = 'high';
    priorityReason = 'Missing both insurance details and photos — needs a follow-up call.';
  } else if (otherPartyInvolved || rentalUrgent) {
    priority = 'high';
    priorityReason = otherPartyInvolved
      ? 'Another party is involved — liability/claim coordination may be time-sensitive.'
      : 'Customer indicated rental coverage — likely wants a quick turnaround.';
  } else if (missingInfo.length === 0) {
    priority = 'low';
    priorityReason = 'All key fields and at least one photo were provided.';
  }

  const vehicle = [data.vehicle?.year, data.vehicle?.make, data.vehicle?.model]
    .filter(Boolean)
    .join(' ') || 'an unspecified vehicle';
  const insurer = data.insurance?.companyName ? ` with ${data.insurance.companyName}` : '';
  const summary = `${data.contact.fullName} submitted an intake for ${vehicle}${insurer}. ${attachmentCount} attachment(s) provided. ${
    missingInfo.length ? `Missing: ${missingInfo.join(', ')}.` : 'All key details were provided.'
  }`;

  const suggestedNextAction = noContactInfo
    ? 'Find another way to reach the customer before proceeding (check any attached documents for contact info).'
    : missingInfo.length > 0
      ? `Call or text ${data.contact.fullName} to collect: ${missingInfo.slice(0, 2).join(', ')}.`
      : 'Ready to open a repair order — no follow-up needed to get started.';

  return {
    summary,
    priority,
    priorityReason,
    missingInfo,
    suggestedNextAction,
    generatedBy: 'rules',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * OpenAI-backed triage. Uses a plain fetch call (no SDK dependency) so this
 * stays lightweight; falls back to the rule-based engine on any failure so
 * a flaky AI call never blocks the shop from seeing a submission.
 */
async function triageWithOpenAI(input: TriageInput): Promise<AiTriageSummary> {
  const prompt = `You are triaging a collision-repair customer intake for a body shop's front desk.
Given this JSON payload, respond with ONLY a JSON object matching this shape:
{"summary": string, "priority": "low"|"medium"|"high"|"urgent", "priorityReason": string, "missingInfo": string[], "suggestedNextAction": string}

Intake data: ${JSON.stringify(input.data)}
Attachments provided: ${input.attachmentCount}`;

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
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI request failed: ${res.status}`);
  }

  const body = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = body.choices[0]?.message.content;
  if (!content) {
    throw new Error('OpenAI response had no content');
  }
  const parsed = JSON.parse(content) as Omit<AiTriageSummary, 'generatedBy' | 'generatedAt'>;

  return { ...parsed, generatedBy: 'openai', generatedAt: new Date().toISOString() };
}

/**
 * Generate a triage summary for a submission. Tries OpenAI when configured;
 * always falls back to the deterministic rule engine on any failure so this
 * feature is never a single point of failure for the core intake flow.
 */
export async function generateTriageSummary(input: TriageInput): Promise<AiTriageSummary> {
  if (hasOpenAI) {
    try {
      return await triageWithOpenAI(input);
    } catch {
      // fall through to rules
    }
  }
  return triageWithRules(input);
}


