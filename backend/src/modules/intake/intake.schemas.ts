import { z } from 'zod';

/**
 * Intake form contracts.
 *
 * The schema mirrors the field groups in the master plan (contact, insurance,
 * license, vehicle, rental, claim). Almost everything is optional because a
 * stressed customer right after an accident may not have every detail — we
 * capture what we can and let the shop follow up. `customerName` is the one
 * hard requirement so the submission is identifiable.
 *
 * Grouping keeps the payload readable and lets us evolve individual sections
 * without touching the rest. The whole object is persisted as JSON while a few
 * summary fields are promoted to indexed columns (see intake.service).
 */

const preferredContactMethod = z.enum(['phone', 'email', 'text']);

export const contactSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(200),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  preferredContactMethod: preferredContactMethod.optional(),
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

export const submissionParamsSchema = z.object({
  id: z.string().min(1),
});

/**
 * Categories a customer can attach. Kept as a closed list so the shop's email
 * (next phase) can group/label attachments predictably, but easy to extend.
 */
export const attachmentKind = z.enum([
  'insurance_card_front',
  'insurance_card_back',
  'license_front',
  'license_back',
  'vehicle_photo',
  'damage_photo',
  'vin_photo',
  'other',
]);
export type AttachmentKind = z.infer<typeof attachmentKind>;

/** Image + PDF only — what a shop actually needs from an intake. */
export const ALLOWED_UPLOAD_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

/** Helper: build a human-friendly "2021 Toyota Camry" summary string. */
export function buildVehicleSummary(vehicle: CreateIntakeInput['vehicle']): string | undefined {
  if (!vehicle) return undefined;
  const parts = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}


