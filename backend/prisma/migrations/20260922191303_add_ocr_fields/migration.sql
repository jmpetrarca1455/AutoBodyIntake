-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "ocrData" JSONB,
ADD COLUMN     "ocrGeneratedAt" TIMESTAMP(3);

