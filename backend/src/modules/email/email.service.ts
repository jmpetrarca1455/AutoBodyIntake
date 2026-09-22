import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Resend } from 'resend';
import { config, emailDriver, hasEmail } from '../../config/index.js';
import { storage } from '../storage/storage.service.js';
import {
  renderSubmissionEmail,
  type SubmissionWithRelations,
} from './email.template.js';

/**
 * Email delivery for packaged intake submissions.
 *
 * Two interchangeable backends (mirrors the storage design):
 *   • resend  — real transactional email via Resend. Used when RESEND_API_KEY set.
 *   • preview — writes the rendered .html to disk and logs it. Zero-config dev.
 *
 * Attachments are pulled from storage and attached to the outgoing email so the
 * secretary receives one complete message with every photo/document.
 */
export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendResult {
  driver: 'resend' | 'preview';
  to: string;
  messageId?: string;
  previewPath?: string;
}

/** Gather attachment bytes from storage for the outgoing email. */
async function collectAttachments(
  submission: SubmissionWithRelations,
): Promise<EmailAttachment[]> {
  const result: EmailAttachment[] = [];
  for (const a of submission.attachments) {
    if (!a.storageKey) continue;
    try {
      const content = await storage.getBytes(a.storageKey);
      result.push({ filename: a.fileName, content, contentType: a.contentType });
    } catch {
      // Skip unreadable files rather than failing the whole email.
    }
  }
  return result;
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
  text: string,
  attachments: EmailAttachment[],
): Promise<SendResult> {
  const resend = new Resend(config.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: config.EMAIL_FROM,
    to,
    subject,
    html,
    text,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });
  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
  return { driver: 'resend', to, messageId: data?.id };
}

async function sendViaPreview(
  to: string,
  subject: string,
  html: string,
  submissionId: string,
  attachments: EmailAttachment[],
): Promise<SendResult> {
  const dir = resolve(config.UPLOAD_DIR, '_email_previews');
  await mkdir(dir, { recursive: true });
  const previewPath = join(dir, `${submissionId}.html`);
  const banner = `<div style="background:#fffbdd;border-bottom:1px solid #e6d800;padding:8px 12px;font:13px system-ui">
    <strong>EMAIL PREVIEW (not sent)</strong> — To: ${to} · Subject: ${subject} · Attachments: ${attachments.length}
  </div>`;
  await writeFile(previewPath, banner + html, 'utf8');
  return { driver: 'preview', to, previewPath };
}

/**
 * Package a submission into an email and deliver it to the shop's secretary.
 * Returns delivery metadata; throws only on unexpected send failures.
 */
export async function sendSubmissionEmail(
  submission: SubmissionWithRelations,
): Promise<SendResult> {
  const to = submission.shop.secretaryEmail;
  const { subject, html, text } = renderSubmissionEmail(submission);
  const attachments = await collectAttachments(submission);

  if (hasEmail) {
    return sendViaResend(to, subject, html, text, attachments);
  }
  return sendViaPreview(to, subject, html, submission.id, attachments);
}

export { emailDriver };

