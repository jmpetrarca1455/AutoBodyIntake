import { createHmac } from 'node:crypto';
import { config, hasTwilio, smsDriver } from '../../config/index.js';

/**
 * SMS delivery for customer status updates.
 *
 * Two interchangeable backends (same pattern as email/storage/ai):
 *   • twilio  — real SMS via Twilio's REST API (plain fetch, no SDK dep,
 *     consistent with how the AI services call OpenAI).
 *   • preview — logs the message and returns a "preview" result. Zero-config
 *     dev — the whole status-update flow is testable without a Twilio account.
 */
export interface SmsResult {
  driver: 'twilio' | 'preview';
  to: string;
  sid?: string;
}

async function sendViaTwilio(to: string, body: string): Promise<SmsResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString(
    'base64',
  );
  const params = new URLSearchParams({
    To: to,
    From: config.TWILIO_FROM_NUMBER!,
    Body: body,
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Twilio request failed: ${res.status} ${detail}`);
  }

  const data = (await res.json()) as { sid?: string };
  return { driver: 'twilio', to, sid: data.sid };
}

function sendViaPreview(to: string, body: string): SmsResult {
  // eslint-disable-next-line no-console
  console.log(`[sms-preview] To: ${to}\n${body}`);
  return { driver: 'preview', to };
}

/** Send an SMS. Never throws for the "preview" path; Twilio failures propagate. */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (hasTwilio) {
    return sendViaTwilio(to, body);
  }
  return sendViaPreview(to, body);
}

export { smsDriver };

/**
 * Verify an inbound Twilio webhook request signature (X-Twilio-Signature).
 * Only enforced when Twilio is actually configured (hasTwilio) — in local
 * "preview" dev (no Twilio account), inbound webhooks are only reachable by
 * whoever calls them directly (e.g. a curl test), so we skip verification
 * to keep zero-config testing simple.
 *
 * Algorithm per Twilio's docs: HMAC-SHA1 of the full request URL with all
 * POST params (sorted by key, concatenated as key+value) appended, keyed by
 * the auth token, base64-encoded, compared to the signature header.
 */
export function verifyTwilioSignature(
  fullUrl: string,
  params: Record<string, string>,
  signatureHeader: string | undefined,
): boolean {
  if (!hasTwilio) return true; // nothing to verify against in preview mode
  if (!signatureHeader) return false;

  const sortedKeys = Object.keys(params).sort();
  let data = fullUrl;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const expected = createHmac('sha1', config.TWILIO_AUTH_TOKEN!)
    .update(Buffer.from(data, 'utf8'))
    .digest('base64');

  return expected === signatureHeader;
}



