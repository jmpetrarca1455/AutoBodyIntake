-- Shop portal auth (owner login) + AI triage fields.

ALTER TABLE "Shop" ADD COLUMN "ownerEmail" TEXT;
ALTER TABLE "Shop" ADD COLUMN "passwordHash" TEXT;
CREATE UNIQUE INDEX "Shop_ownerEmail_key" ON "Shop"("ownerEmail");

ALTER TABLE "Submission" ADD COLUMN "aiSummary" JSONB;
ALTER TABLE "Submission" ADD COLUMN "aiSummaryGeneratedAt" TIMESTAMP(3);

