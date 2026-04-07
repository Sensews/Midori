-- AlterTable
ALTER TABLE "User" ADD COLUMN "refreshTokenExpiresAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "refreshTokenHash" TEXT;
