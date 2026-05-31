-- CreateEnum
CREATE TYPE "FlightDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'TURNAROUND');

-- AlterTable
ALTER TABLE "flights" ADD COLUMN     "direction" "FlightDirection" NOT NULL DEFAULT 'TURNAROUND';
