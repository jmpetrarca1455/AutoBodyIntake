/**
 * Intake contracts — re-exported from @autobody/shared (single source of
 * truth used by both the backend and the customer app). Add new fields in
 * packages/shared/src/intake.contracts.ts; both sides pick them up.
 */
export {
  contactSchema,
  insuranceSchema,
  licenseSchema,
  vehicleSchema,
  rentalSchema,
  claimSchema,
  createIntakeSchema,
  submissionParamsSchema,
  buildVehicleSummary,
  attachmentKind,
  ALLOWED_UPLOAD_CONTENT_TYPES,
  type CreateIntakeInput,
  type AttachmentKind,
  type CreatedSubmission,
} from '@autobody/shared';
