import type { CreateIntakeInput } from '@autobody/shared';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../config/index.js';
import { draftAdjusterEmail } from '../ai/drafts.service.js';
import { sendRawEmail } from '../email/email.service.js';

/**
 * Automated insurance-adjuster follow-ups — the "no reply in N days? nudge
 * them automatically" layer on top of the one-click manual draft/send in
 * communications.service.ts. Off by default (AUTO_ADJUSTER_FOLLOWUP_ENABLED)
 * since auto-sending email on a shop's behalf is a meaningful behavior
 * change; shops opt in.
 *
 * Criteria for a submission to get an automated nudge:
 *   - Has a claim number on file (nothing to chase otherwise)
 *   - Has an adjuster email on file (nowhere to send it otherwise)
 *   - Not archived
 *   - No adjuster email (channel=email, milestone=null — see
 *     communications.service.ts's convention) sent within the last
 *     AUTO_ADJUSTER_FOLLOWUP_DAYS days
 */
export interface SweepResult {
  checked: number;
  sent: number;
  skipped: number;
}

export async function runAdjusterFollowUpSweep(shopId?: string): Promise<SweepResult> {
  const days = config.AUTO_ADJUSTER_FOLLOWUP_DAYS;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const submissions = await prisma.submission.findMany({
    where: {
      status: { not: 'ARCHIVED' },
      createdAt: { lte: cutoff },
      ...(shopId ? { shopId } : {}),
    },
    include: {
      shop: true,
      attachments: true,
      communications: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const submission of submissions) {
    const data = submission.data as unknown as CreateIntakeInput;
    const adjusterEmail = data.insurance?.adjusterContact;
    const claimNumber = submission.claimNumber ?? data.insurance?.claimNumber;

    if (!adjusterEmail || !adjusterEmail.includes('@') || !claimNumber) {
      skipped++;
      continue;
    }

    const lastAdjusterEmail = submission.communications.find(
      (c) => c.channel === 'email' && c.milestone === null,
    );
    if (lastAdjusterEmail && lastAdjusterEmail.createdAt > cutoff) {
      skipped++;
      continue; // followed up recently enough already
    }

    const daysSinceReceived = Math.max(
      0,
      Math.floor((Date.now() - submission.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
    );

    const draft = await draftAdjusterEmail({
      shopName: submission.shop.name,
      customerName: submission.customerName,
      vehicleInfo: submission.vehicleInfo,
      claimNumber,
      policyNumber: data.insurance?.policyNumber,
      insuranceCompany: data.insurance?.companyName,
      adjusterName: data.insurance?.adjusterName,
      attachmentCount: submission.attachments.length,
      daysSinceReceived,
    });

    let status: 'sent' | 'failed' | 'preview' = 'sent';
    try {
      const result = await sendRawEmail(adjusterEmail, draft.subject, draft.body);
      status = result.driver === 'preview' ? 'preview' : 'sent';
    } catch {
      status = 'failed';
    }

    await prisma.communicationLog.create({
      data: {
        submissionId: submission.id,
        channel: 'email',
        direction: 'outbound',
        milestone: null,
        subject: draft.subject,
        body: draft.body,
        aiDrafted: true,
        status,
      },
    });
    sent++;
  }

  return { checked: submissions.length, sent, skipped };
}

/**
 * Starts the recurring background sweep (no-op unless
 * AUTO_ADJUSTER_FOLLOWUP_ENABLED is set). Returns a cleanup function for
 * graceful shutdown.
 */
export function startAutomationScheduler(logger: { info: (msg: string) => void; warn: (obj: unknown, msg: string) => void }): () => void {
  if (!config.AUTO_ADJUSTER_FOLLOWUP_ENABLED) {
    return () => {};
  }

  logger.info(
    `[automation] Adjuster follow-up sweep enabled — every ${Math.round(
      config.AUTO_ADJUSTER_FOLLOWUP_INTERVAL_MS / 60000,
    )} min, nudging claims idle ${config.AUTO_ADJUSTER_FOLLOWUP_DAYS}+ days.`,
  );

  const run = () => {
    runAdjusterFollowUpSweep()
      .then((result) => logger.info(`[automation] Sweep complete: ${JSON.stringify(result)}`))
      .catch((err) => logger.warn({ err }, '[automation] Sweep failed'));
  };

  // Run once shortly after boot, then on the configured interval.
  const initialTimer = setTimeout(run, 30_000);
  const interval = setInterval(run, config.AUTO_ADJUSTER_FOLLOWUP_INTERVAL_MS);

  return () => {
    clearTimeout(initialTimer);
    clearInterval(interval);
  };
}

