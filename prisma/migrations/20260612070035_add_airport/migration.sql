/*
  Warnings:

  - A unique constraint covering the columns `[code,zoneId]` on the table `parking_stands` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `airportId` to the `flights` table without a default value. This is not possible if the table is not empty.
  - Added the required column `airportId` to the `sensors` table without a default value. This is not possible if the table is not empty.
  - Added the required column `airportId` to the `zones` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "flights_status_idx";

-- DropIndex
DROP INDEX "parking_stands_code_key";

-- DropIndex
DROP INDEX "sensors_type_status_idx";

-- DropIndex
DROP INDEX "sensors_zoneId_idx";

-- AlterTable
ALTER TABLE "flights" ADD COLUMN     "airportId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "sensors" ADD COLUMN     "airportId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "zones" ADD COLUMN     "airportId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "airports" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "airports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "airports_code_key" ON "airports"("code");

-- CreateIndex
CREATE INDEX "flights_airportId_status_idx" ON "flights"("airportId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "parking_stands_code_zoneId_key" ON "parking_stands"("code", "zoneId");

-- CreateIndex
CREATE INDEX "sensors_airportId_type_status_idx" ON "sensors"("airportId", "type", "status");

-- CreateIndex
CREATE INDEX "zones_airportId_idx" ON "zones"("airportId");

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_airportId_fkey" FOREIGN KEY ("airportId") REFERENCES "airports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensors" ADD CONSTRAINT "sensors_airportId_fkey" FOREIGN KEY ("airportId") REFERENCES "airports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_airportId_fkey" FOREIGN KEY ("airportId") REFERENCES "airports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
