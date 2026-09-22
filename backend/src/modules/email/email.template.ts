import type { Attachment, Shop, Submission } from '@prisma/client';
import type { CreateIntakeInput } from '../intake/intake.schemas.js';

export interface SubmissionWithRelations extends Submission {
  shop: Shop;
  attachments: Attachment[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Human labels for attachment categories, used in the email. */
const KIND_LABELS: Record<string, string> = {
  insurance_card_front: 'Insurance card (front)',
  insurance_card_back: 'Insurance card (back)',
  license_front: "Driver's license (front)",
  license_back: "Driver's license (back)",
  vehicle_photo: 'Vehicle photo',
  damage_photo: 'Damage photo',
  vin_photo: 'VIN photo',
  other: 'Other document',
};

function esc(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** A labeled row, skipped entirely when the value is empty. */
function row(label: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return `<tr><td style="padding:4px 12px 4px 0;color:#555;white-space:nowrap;vertical-align:top">${esc(
    label,
  )}</td><td style="padding:4px 0;color:#111">${esc(value)}</td></tr>`;
}

function section(title: string, rows: string): string {
  if (!rows.trim()) return '';
  return `
    <h3 style="margin:20px 0 6px;font:600 15px system-ui,sans-serif;color:#111">${esc(title)}</h3>
    <table style="border-collapse:collapse;font:14px system-ui,sans-serif">${rows}</table>`;
}

/** Plain-text mirror of a section (for email clients without HTML). */
function textLine(label: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return `  ${label}: ${value}\n`;
}

/**
 * Turn a submission into a clean, complete email for the shop's secretary.
 * The whole point of the MVP: one tidy message with every field + attachments.
 */
export function renderSubmissionEmail(submission: SubmissionWithRelations): RenderedEmail {
  const data = submission.data as unknown as CreateIntakeInput;
  const { contact, insurance, license, vehicle, rental, claim } = data;
  const shopName = submission.shop.name;

  const subject = `New intake — ${contact.fullName}${
    submission.vehicleInfo ? ` (${submission.vehicleInfo})` : ''
  }`;

  // ── HTML ─────────────────────────────────────────────
  const attachmentsHtml = submission.attachments.length
    ? `<h3 style="margin:20px 0 6px;font:600 15px system-ui,sans-serif;color:#111">Attachments (${
        submission.attachments.length
      })</h3><ul style="margin:0;padding-left:18px;font:14px system-ui,sans-serif;color:#111">${submission.attachments
        .map(
          (a) =>
            `<li>${esc(KIND_LABELS[a.kind] ?? a.kind)} — ${esc(a.fileName)} (${Math.round(
              a.sizeBytes / 1024,
            )} KB)</li>`,
        )
        .join('')}</ul>`
    : '<p style="font:14px system-ui,sans-serif;color:#777">No files attached.</p>';

  const html = `
  <div style="max-width:640px;margin:0 auto;padding:24px;background:#fff">
    <p style="font:13px system-ui,sans-serif;color:#888;margin:0 0 4px">New customer intake for ${esc(
      shopName,
    )}</p>
    <h2 style="margin:0 0 2px;font:700 20px system-ui,sans-serif;color:#111">${esc(
      contact.fullName,
    )}</h2>
    <p style="font:13px system-ui,sans-serif;color:#888;margin:0">Received ${esc(
      submission.createdAt.toISOString(),
    )} · Ref ${esc(submission.id)}</p>

    ${section(
      'Contact',
      row('Phone', contact.phone) +
        row('Email', contact.email) +
        row('Preferred contact', contact.preferredContactMethod),
    )}
    ${section(
      'Insurance',
      row('Company', insurance?.companyName) +
        row('Policy #', insurance?.policyNumber) +
        row('Claim #', insurance?.claimNumber) +
        row('Adjuster', insurance?.adjusterName) +
        row('Adjuster contact', insurance?.adjusterContact),
    )}
    ${section(
      "Driver's license",
      row('Name', license?.name) +
        row('License #', license?.number) +
        row('Expiration', license?.expiration),
    )}
    ${section(
      'Vehicle',
      row('Year / Make / Model', submission.vehicleInfo) +
        row('VIN', vehicle?.vin) +
        row('License plate', vehicle?.licensePlate) +
        row('Mileage', vehicle?.mileage) +
        row('Damage', vehicle?.damageDescription),
    )}
    ${section(
      'Rental coverage',
      row('Has coverage', rental?.hasCoverage) +
        row('Limit / days', rental?.limitOrDays) +
        row('Preference', rental?.preference),
    )}
    ${section(
      'Claim / accident',
      row('Date', claim?.accidentDate) +
        row('Location', claim?.accidentLocation) +
        row('Police report #', claim?.policeReportNumber) +
        row('At fault', claim?.atFault) +
        row('Other party', claim?.otherPartyInfo),
    )}

    ${attachmentsHtml}

    <p style="margin-top:24px;font:12px system-ui,sans-serif;color:#aaa">Sent by AutoBody Intake.</p>
  </div>`;

  // ── Plain text ───────────────────────────────────────
  const text =
    `New customer intake for ${shopName}\n` +
    `Customer: ${contact.fullName}\n` +
    `Received: ${submission.createdAt.toISOString()} · Ref ${submission.id}\n\n` +
    `Contact\n` +
    textLine('Phone', contact.phone) +
    textLine('Email', contact.email) +
    textLine('Preferred contact', contact.preferredContactMethod) +
    `\nInsurance\n` +
    textLine('Company', insurance?.companyName) +
    textLine('Policy #', insurance?.policyNumber) +
    textLine('Claim #', insurance?.claimNumber) +
    textLine('Adjuster', insurance?.adjusterName) +
    `\nDriver's license\n` +
    textLine('Name', license?.name) +
    textLine('License #', license?.number) +
    textLine('Expiration', license?.expiration) +
    `\nVehicle\n` +
    textLine('Year/Make/Model', submission.vehicleInfo) +
    textLine('VIN', vehicle?.vin) +
    textLine('Plate', vehicle?.licensePlate) +
    textLine('Mileage', vehicle?.mileage) +
    textLine('Damage', vehicle?.damageDescription) +
    `\nRental\n` +
    textLine('Has coverage', rental?.hasCoverage) +
    textLine('Limit/days', rental?.limitOrDays) +
    textLine('Preference', rental?.preference) +
    `\nClaim/accident\n` +
    textLine('Date', claim?.accidentDate) +
    textLine('Location', claim?.accidentLocation) +
    textLine('Police report #', claim?.policeReportNumber) +
    textLine('At fault', claim?.atFault) +
    `\nAttachments: ${submission.attachments.length}\n`;

  return { subject, html, text };
}

