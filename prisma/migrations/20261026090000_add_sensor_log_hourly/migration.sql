-- CreateTable
CREATE TABLE "sensor_log_hourly" (
    "id" TEXT NOT NULL,
    "sensorId" TEXT NOT NULL,
    "bucket" TIMESTAMP(3) NOT NULL,
    "min" DOUBLE PRECISION NOT NULL,
    "max" DOUBLE PRECISION NOT NULL,
    "avg" DOUBLE PRECISION NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "sensor_log_hourly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sensor_log_hourly_sensorId_bucket_key" ON "sensor_log_hourly"("sensorId", "bucket");

-- AddForeignKey
ALTER TABLE "sensor_log_hourly" ADD CONSTRAINT "sensor_log_hourly_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill rollups from the raw logs that already exist
INSERT INTO "sensor_log_hourly" ("id", "sensorId", "bucket", "min", "max", "avg", "count")
SELECT gen_random_uuid()::text, "sensorId", date_trunc('hour', "timestamp"), MIN("value"), MAX("value"), AVG("value"), COUNT(*)::int
FROM "sensor_logs"
GROUP BY "sensorId", date_trunc('hour', "timestamp")
ON CONFLICT ("sensorId", "bucket") DO NOTHING;
