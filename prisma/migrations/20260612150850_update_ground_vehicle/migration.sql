/*
  Warnings:

  - The values [IDLE,DISPATCHED,CHARGING,MAINTENANCE,OFFLINE] on the enum `VehicleStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [BAGGAGE_TUG,FUEL_TRUCK,PASSENGER_BUS,CATERING_TRUCK,FOLLOW_ME_CAR] on the enum `VehicleType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `callsign` on the `ground_vehicles` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[licensePlate]` on the table `ground_vehicles` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `licensePlate` to the `ground_vehicles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `heading` to the `vehicle_telemetry` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "VehicleStatus_new" AS ENUM ('APPROACHING_DROP_OFF', 'DROPPING_OFF', 'PARKED', 'APPROACHING_PICK_UP', 'PICKING_UP', 'EXITING');
ALTER TABLE "public"."ground_vehicles" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ground_vehicles" ALTER COLUMN "status" TYPE "VehicleStatus_new" USING ("status"::text::"VehicleStatus_new");
ALTER TYPE "VehicleStatus" RENAME TO "VehicleStatus_old";
ALTER TYPE "VehicleStatus_new" RENAME TO "VehicleStatus";
DROP TYPE "public"."VehicleStatus_old";
ALTER TABLE "ground_vehicles" ALTER COLUMN "status" SET DEFAULT 'APPROACHING_DROP_OFF';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "VehicleType_new" AS ENUM ('PERSONAL_CAR', 'TAXI', 'RIDE_HAIL', 'VIP_TRANSFER');
ALTER TABLE "ground_vehicles" ALTER COLUMN "type" TYPE "VehicleType_new" USING ("type"::text::"VehicleType_new");
ALTER TYPE "VehicleType" RENAME TO "VehicleType_old";
ALTER TYPE "VehicleType_new" RENAME TO "VehicleType";
DROP TYPE "public"."VehicleType_old";
COMMIT;

-- DropIndex
DROP INDEX "ground_vehicles_callsign_key";

-- AlterTable
ALTER TABLE "ground_vehicles" DROP COLUMN "callsign",
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "carModel" TEXT,
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "licensePlate" TEXT NOT NULL,
ADD COLUMN     "logoUrl" TEXT,
ALTER COLUMN "status" SET DEFAULT 'APPROACHING_DROP_OFF';

-- AlterTable
ALTER TABLE "vehicle_telemetry" ADD COLUMN     "heading" DOUBLE PRECISION NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ground_vehicles_licensePlate_key" ON "ground_vehicles"("licensePlate");
