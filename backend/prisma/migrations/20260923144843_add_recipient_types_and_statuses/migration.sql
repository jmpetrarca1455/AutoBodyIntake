-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubmissionStatus" ADD VALUE 'IN_REVIEW';
ALTER TYPE "SubmissionStatus" ADD VALUE 'ESTIMATE_READY';
ALTER TYPE "SubmissionStatus" ADD VALUE 'IN_REPAIR';
ALTER TYPE "SubmissionStatus" ADD VALUE 'READY_FOR_PICKUP';
ALTER TYPE "SubmissionStatus" ADD VALUE 'COMPLETED';

-- AlterTable
ALTER TABLE "CommunicationLog" ADD COLUMN     "recipientLabel" TEXT,
ADD COLUMN     "recipientType" TEXT NOT NULL DEFAULT 'customer';

-- CreateIndex
CREATE INDEX "CommunicationLog_submissionId_recipientType_idx" ON "CommunicationLog"("submissionId", "recipientType");
