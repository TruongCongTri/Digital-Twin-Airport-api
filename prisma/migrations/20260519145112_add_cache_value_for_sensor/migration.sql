-- AlterTable
ALTER TABLE "sensors" ADD COLUMN     "currentValue" DOUBLE PRECISION,
ADD COLUMN     "lastReadAt" TIMESTAMP(3);
