-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "damageAssessment" JSONB,
ADD COLUMN     "damageAssessmentGeneratedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CommunicationLog" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "milestone" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "aiDrafted" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunicationLog_submissionId_createdAt_idx" ON "CommunicationLog"("submissionId", "createdAt");

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
