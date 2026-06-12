-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('BAGGAGE_TUG', 'FUEL_TRUCK', 'PASSENGER_BUS', 'CATERING_TRUCK', 'FOLLOW_ME_CAR');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('IDLE', 'DISPATCHED', 'CHARGING', 'MAINTENANCE', 'OFFLINE');

-- CreateTable
CREATE TABLE "ground_vehicles" (
    "id" TEXT NOT NULL,
    "callsign" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'IDLE',
    "airportId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ground_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_telemetry" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "speed" DOUBLE PRECISION NOT NULL,
    "batteryLevel" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ground_vehicles_callsign_key" ON "ground_vehicles"("callsign");

-- CreateIndex
CREATE INDEX "ground_vehicles_airportId_type_status_idx" ON "ground_vehicles"("airportId", "type", "status");

-- CreateIndex
CREATE INDEX "vehicle_telemetry_vehicleId_timestamp_idx" ON "vehicle_telemetry"("vehicleId", "timestamp" DESC);

-- AddForeignKey
ALTER TABLE "ground_vehicles" ADD CONSTRAINT "ground_vehicles_airportId_fkey" FOREIGN KEY ("airportId") REFERENCES "airports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_telemetry" ADD CONSTRAINT "vehicle_telemetry_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "ground_vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
