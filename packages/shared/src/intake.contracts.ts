import { z } from 'zod';

/**
 * Intake form contracts — the field groups from the master plan (contact,
 * insurance, license, vehicle, rental, claim). This is the ONE place these
 * fields are defined; the backend validates with it and the app gets its
 * TypeScript types from it. Add a field here and both sides pick it up.
 *
 * Almost everything is optional — a customer right after an accident may not
 * have every detail. `contact.fullName` is the one hard requirement.
 */
const preferredContactMethod = z.enum(['phone', 'email', 'text']);

export const contactSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(200),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  preferredContactMethod: preferredContactMethod.optional(),
  /**
   * TCPA-required explicit opt-in before the shop may text this customer
   * automated status updates. Defaults false (never assume consent).
   * Gate every outbound SMS on this — see backend communications.service.ts.
   */
  smsConsent: z.boolean().optional().default(false),
});

export const insuranceSchema = z
  .object({
    companyName: z.string().max(200).optional(),
    policyNumber: z.string().max(100).optional(),
    claimNumber: z.string().max(100).optional(),
    adjusterName: z.string().max(200).optional(),
    adjusterContact: z.string().max(200).optional(),
  })
  .optional();

export const licenseSchema = z
  .object({
    name: z.string().max(200).optional(),
    number: z.string().max(100).optional(),
    expiration: z.string().max(50).optional(),
  })
  .optional();

export const vehicleSchema = z
  .object({
    year: z.coerce.number().int().min(1900).max(2100).optional(),
    make: z.string().max(100).optional(),
    model: z.string().max(100).optional(),
    vin: z.string().max(64).optional(),
    licensePlate: z.string().max(20).optional(),
    mileage: z.coerce.number().int().nonnegative().optional(),
    damageDescription: z.string().max(5000).optional(),
  })
  .optional();

export const rentalSchema = z
  .object({
    hasCoverage: z.enum(['yes', 'no', 'unknown']).optional(),
    limitOrDays: z.string().max(100).optional(),
    preference: z.string().max(200).optional(),
  })
  .optional();

export const claimSchema = z
  .object({
    accidentDate: z.string().max(50).optional(),
    accidentLocation: z.string().max(300).optional(),
    policeReportNumber: z.string().max(100).optional(),
    otherPartyInfo: z.string().max(1000).optional(),
    atFault: z.enum(['self', 'other', 'unknown']).optional(),
  })
  .optional();

/** The complete intake payload submitted by the customer. */
export const createIntakeSchema = z.object({
  contact: contactSchema,
  insurance: insuranceSchema,
  license: licenseSchema,
  vehicle: vehicleSchema,
  rental: rentalSchema,
  claim: claimSchema,
});
export type CreateIntakeInput = z.infer<typeof createIntakeSchema>;

/**
 * Partial update to an already-created submission — used to merge in fields
 * the customer didn't have to type (e.g. OCR auto-fill from a license or
 * insurance card photo) after the initial submit. Every group is optional
 * and merged shallowly server-side; `contact.fullName` is NOT required here
 * since the submission already has one.
 */
export const updateIntakeSchema = z.object({
  contact: contactSchema.partial().optional(),
  insurance: insuranceSchema,
  license: licenseSchema,
  vehicle: vehicleSchema,
  rental: rentalSchema,
  claim: claimSchema,
});
export type UpdateIntakeInput = z.infer<typeof updateIntakeSchema>;

export const submissionParamsSchema = z.object({ id: z.string().min(1) });

/** Helper: build a human-friendly "2021 Toyota Camry" summary string. */
export function buildVehicleSummary(vehicle: CreateIntakeInput['vehicle']): string | undefined {
  if (!vehicle) return undefined;
  const parts = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

/**
 * Categories a customer can attach. Closed list so shop-facing views (email,
 * future dashboard) can group/label attachments predictably, but easy to grow.
 */
export const attachmentKind = z.enum([
  'insurance_card_front',
  'insurance_card_back',
  'license_front',
  'license_back',
  'registration_front',
  'registration_back',
  'vehicle_photo',
  'damage_photo',
  'vin_photo',
  'estimate_document',
  'repair_order',
  'other',
]);
export type AttachmentKind = z.infer<typeof attachmentKind>;

/** Human-friendly labels for each attachment category — used by any UI that
 * lists/groups attachments (dashboard file manager, etc.). */
export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  insurance_card_front: 'Insurance card (front)',
  insurance_card_back: 'Insurance card (back)',
  license_front: "Driver's license (front)",
  license_back: "Driver's license (back)",
  registration_front: 'Vehicle registration (front)',
  registration_back: 'Vehicle registration (back)',
  vehicle_photo: 'Vehicle photo',
  damage_photo: 'Damage photo',
  vin_photo: 'VIN photo',
  estimate_document: 'Estimate document',
  repair_order: 'Repair order',
  other: 'Other document',
};

/** Lifecycle status a submission can be in, editable by staff from the
 * dashboard (beyond the automatic RECEIVED/EMAILED/FAILED set by intake). */
export const submissionStatusValues = [
  'RECEIVED',
  'IN_REVIEW',
  'EMAILED',
  'ESTIMATE_READY',
  'IN_REPAIR',
  'READY_FOR_PICKUP',
  'COMPLETED',
  'FAILED',
  'ARCHIVED',
] as const;
export const submissionStatus = z.enum(submissionStatusValues);
export type SubmissionStatusValue = z.infer<typeof submissionStatus>;
export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatusValue, string> = {
  RECEIVED: 'Received',
  IN_REVIEW: 'In review',
  EMAILED: 'Emailed to shop',
  ESTIMATE_READY: 'Estimate ready',
  IN_REPAIR: 'In repair',
  READY_FOR_PICKUP: 'Ready for pickup',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  ARCHIVED: 'Archived',
};

/**
 * Full staff-editable patch of a submission's intake data plus its
 * lifecycle status — used by the dashboard's "edit customer file" screen.
 * Same shallow-merge semantics as `updateIntakeSchema` (customer-facing).
 */
export const staffUpdateSubmissionSchema = z.object({
  contact: contactSchema.partial().optional(),
  insurance: insuranceSchema,
  license: licenseSchema,
  vehicle: vehicleSchema,
  rental: rentalSchema,
  claim: claimSchema,
  status: submissionStatus.optional(),
});
export type StaffUpdateSubmissionInput = z.infer<typeof staffUpdateSubmissionSchema>;

/** Image + PDF only — what a shop actually needs from an intake. */
export const ALLOWED_UPLOAD_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

export interface CreatedSubmission {
  id: string;
  status: string;
  shopName: string;
  receivedAt: string;
  message: string;
}




