-- CreateEnum
CREATE TYPE "ShopRole" AS ENUM ('OWNER', 'STAFF');

-- CreateTable
CREATE TABLE "ShopUser" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "ShopRole" NOT NULL DEFAULT 'STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopUser_email_key" ON "ShopUser"("email");

-- CreateIndex
CREATE INDEX "ShopUser_shopId_idx" ON "ShopUser"("shopId");

-- AddForeignKey
ALTER TABLE "ShopUser" ADD CONSTRAINT "ShopUser_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

