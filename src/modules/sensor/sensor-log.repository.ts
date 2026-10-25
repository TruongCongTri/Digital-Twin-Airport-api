import { Prisma, SensorLog, SensorType } from '@/generated/index';
import { BaseRepository } from '@/common/repositories/base.repository';
import { prisma } from '@/common/configs/prisma';

/** One history bucket. Raw samples are reported as min = max = avg with count 1. */
export interface SensorSeriesRow {
  bucket: Date;
  min: number;
  max: number;
  avg: number;
  count: number;
}
import { GetSensorHistoryQuery } from './sensor.schema';

export class SensorLogRepository extends BaseRepository<Prisma.SensorLogDelegate> {
  constructor() {
    super('sensorLog');
  }

  /**
   * @method findHistory
   * @description Fetches paginated logs. If sensorId is provided, fetches for ONE sensor.
   * If sensorId is null, fetches globally across ALL sensors (with optional type/zone filters).
   */
  public async findHistory(query: GetSensorHistoryQuery, sensorId?: string) {
    const where: Prisma.SensorLogWhereInput = {};

    if (sensorId !== undefined) {
      where.sensorId = sensorId;
    }

    if (query.startDate !== undefined && query.endDate !== undefined) {
      where.timestamp = {
        gte: new Date(query.startDate),
        lte: new Date(query.endDate),
      };
    }

    // Apply parent Sensor filters (e.g., fetching all logs for VVTS)
    if (
      sensorId === undefined &&
      (query.type !== undefined || query.zoneId !== undefined || query.airportId !== undefined)
    ) {
      const sensorFilter: Prisma.SensorWhereInput = {};

      if (query.type !== undefined) {
        sensorFilter.type = query.type as SensorType;
      }

      if (query.zoneId !== undefined) {
        sensorFilter.zoneId = query.zoneId;
      }

      if (query.airportId !== undefined) {
        sensorFilter.OR = [{ airportId: query.airportId }, { airport: { code: query.airportId } }];
      }

      where.sensor = sensorFilter;
    }

    return await this.executePagination<SensorLog>({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { timestamp: 'desc' },
      include: {
        sensor: {
          select: { name: true, type: true, zoneId: true, airportId: true },
        },
      },
    });
  }

  /**
   * @method findRawSeries
   * @description Raw minute samples (only available inside the raw retention window).
   */
  public async findRawSeries(sensorId: string, start: Date, end: Date): Promise<SensorSeriesRow[]> {
    return prisma.$queryRaw<SensorSeriesRow[]>`
      SELECT "timestamp" AS "bucket", "value" AS "min", "value" AS "max", "value" AS "avg", 1 AS "count"
      FROM "sensor_logs"
      WHERE "sensorId" = ${sensorId} AND "timestamp" >= ${start} AND "timestamp" < ${end}
      ORDER BY "timestamp" ASC
    `;
  }

  /**
   * @method findHourlySeries
   * @description Hourly rollups (min / max / avg / sample count).
   */
  public async findHourlySeries(
    sensorId: string,
    start: Date,
    end: Date
  ): Promise<SensorSeriesRow[]> {
    return prisma.$queryRaw<SensorSeriesRow[]>`
      SELECT "bucket", "min", "max", "avg", "count"
      FROM "sensor_log_hourly"
      WHERE "sensorId" = ${sensorId} AND "bucket" >= ${start} AND "bucket" < ${end}
      ORDER BY "bucket" ASC
    `;
  }

  /**
   * @method findDailySeries
   * @description Hourly rollups regrouped into local calendar days of `tz`
   * (avg is sample-weighted so partial hours do not skew the day).
   */
  public async findDailySeries(
    sensorId: string,
    start: Date,
    end: Date,
    tz: string
  ): Promise<SensorSeriesRow[]> {
    return prisma.$queryRaw<SensorSeriesRow[]>`
      SELECT
        (date_trunc('day', ("bucket" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}) AT TIME ZONE ${tz}) AS "bucket",
        MIN("min") AS "min",
        MAX("max") AS "max",
        SUM("avg" * "count") / NULLIF(SUM("count"), 0) AS "avg",
        SUM("count")::int AS "count"
      FROM "sensor_log_hourly"
      WHERE "sensorId" = ${sensorId} AND "bucket" >= ${start} AND "bucket" < ${end}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  }
}
