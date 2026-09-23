-- CreateEnum
CREATE TYPE "EstimateLineCategory" AS ENUM ('PARTS', 'LABOR', 'PAINT_MATERIALS', 'SUBLET', 'MISC');

-- CreateEnum
CREATE TYPE "PartsOrderStatus" AS ENUM ('NEEDED', 'ORDERED', 'BACKORDERED', 'RECEIVED', 'INSTALLED', 'RETURNED');

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "dropoffScheduledAt" TIMESTAMP(3),
ADD COLUMN     "pickupScheduledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EstimateLineItem" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "category" "EstimateLineCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "partNumber" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborHours" DOUBLE PRECISION,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimateLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartsOrder" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "partNumber" TEXT,
    "supplier" TEXT,
    "status" "PartsOrderStatus" NOT NULL DEFAULT 'NEEDED',
    "cost" DOUBLE PRECISION,
    "orderedAt" TIMESTAMP(3),
    "expectedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartsOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EstimateLineItem_submissionId_idx" ON "EstimateLineItem"("submissionId");

-- CreateIndex
CREATE INDEX "PartsOrder_submissionId_idx" ON "PartsOrder"("submissionId");

-- CreateIndex
CREATE INDEX "PartsOrder_status_idx" ON "PartsOrder"("status");

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartsOrder" ADD CONSTRAINT "PartsOrder_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
