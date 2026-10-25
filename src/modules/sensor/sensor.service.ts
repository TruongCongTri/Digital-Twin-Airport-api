import { SensorRepository } from './sensor.repository';
import { SensorLogRepository, type SensorSeriesRow } from './sensor-log.repository';
import { env } from '@/common/configs/env';
import {
  CreateSensorDTO,
  GetSensorsQuery,
  UpdateSensorDTO,
  GetSensorHistoryQuery,
  GetSensorSeriesQuery,
  SENSOR_TYPES,
  SENSOR_STATUSES,
} from './sensor.schema';
import { AppError } from '@/common/errors/app.error';
import { ERROR_CODES } from '@/constants/error-codes';
import { MESSAGES } from '@/constants/messages';
import { RESOURCES } from '@/constants/resources';
import { PaginationMetaDto } from '@/data/dtos/pagination.dto';
import redisClient from '@/common/services/redis.service';
import { prisma } from '@/common/configs/prisma';

/**
 * @description Cache key for the live sensor snapshot of one airport (written by the simulation engine).
 */
export const LIVE_SENSOR_CACHE_KEY = (airportCode: string) => `live:sensors:${airportCode}`;

// Airport UUID -> code lookups never change at runtime, so keep them in memory
const airportCodeById = new Map<string, string>();
/**
 * @class SensorService
 * @description Orchestrates business logic, verifies entity existence before mutations,
 * and constructs standardized pagination metadata for the client layer.
 */
export class SensorService {
  private readonly sensorRepository: SensorRepository;
  private readonly sensorLogRepository: SensorLogRepository;

  constructor() {
    this.sensorRepository = new SensorRepository();
    this.sensorLogRepository = new SensorLogRepository();
  }

  /**
   * @description Fetches static sensor data, isolated by airport ID.
   */
  public async getStaticSensors(airportId?: string) {
    // Scope the cache key by airport to prevent cross-facility data leaks
    const cacheKey = `static:sensors:metadata:${airportId || 'global'}`;

    try {
      // 1. Check Redis First
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (error) {
      console.warn('[Redis] Cache read failed for sensors, falling back to DB', error);
    }

    // 2. Fallback to DB (Passes airportId to the Repository)
    const sensors = await this.sensorRepository.getStaticSensors(airportId);

    try {
      // 3. Save to Redis (Cache for 1 Hour)
      await redisClient.setEx(cacheKey, 3600, JSON.stringify(sensors));
    } catch (error) {
      console.warn('[Redis] Cache write failed for sensors', error);
    }

    return sensors;
  }

  /**
   * @description Fetches the latest live sensor values for one airport (accepts code or UUID).
   * Served from memory on this instance, then Redis, then Postgres as last resort.
   */
  public async getLiveSensors(airportId: string) {
    const airportCode = await this.resolveAirportCode(airportId);

    if (airportCode) {
      const cached = await redisClient.get(LIVE_SENSOR_CACHE_KEY(airportCode));
      if (cached)
        return JSON.parse(cached) as { updatedAt: string; values: Record<string, number> };
    }

    // Fallback to the values the simulation last flushed to the DB
    const sensors = await prisma.sensor.findMany({
      where: { OR: [{ airportId }, { airport: { code: airportId } }] },
      select: { id: true, currentValue: true, lastReadAt: true },
    });

    const values: Record<string, number> = {};
    let updatedAt = 0;
    for (const s of sensors) {
      if (s.currentValue !== null) values[s.id] = s.currentValue;
      if (s.lastReadAt) updatedAt = Math.max(updatedAt, s.lastReadAt.getTime());
    }
    return { updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null, values };
  }

  private async resolveAirportCode(airportId: string): Promise<string | null> {
    if (airportCodeById.has(airportId)) return airportCodeById.get(airportId)!;

    const airport = await prisma.airport.findFirst({
      where: { OR: [{ id: airportId }, { code: airportId }] },
      select: { code: true },
    });
    if (!airport) return null;

    airportCodeById.set(airportId, airport.code);
    return airport.code;
  }

  /**
   * @description Create new Sensor
   */
  public async create(data: CreateSensorDTO) {
    return await this.sensorRepository.create(data);
  }

  /**
   * @description Get all Sensor
   */
  public async getAll(query: GetSensorsQuery) {
    const { total, data } = await this.sensorRepository.findManyWithPagination(query);
    const meta = PaginationMetaDto.create(query.page, query.limit, total);
    return { data, meta };
  }

  /**
   * @description Get detail of Sensor by ID
   */
  public async getDetail(id: string) {
    // Optionally include the Zone and Airport relation so the client knows exactly where it is
    const result = await this.sensorRepository.findById(id, {
      include: { zone: true, airport: true },
    });

    if (!result) {
      throw new AppError(
        404,
        MESSAGES.COMMON.ERROR.NOT_FOUND(RESOURCES.SENSOR),
        ERROR_CODES.COMMON.RECORD_NOT_FOUND
      );
    }

    return result;
  }

  /**
   * @description Update Sensor by ID
   */
  public async update(id: string, data: UpdateSensorDTO) {
    await this.getDetail(id);
    return await this.sensorRepository.updateById(id, data);
  }

  /**
   * @description Delete Sensor by ID
   */
  public async delete(id: string) {
    await this.getDetail(id);
    return await this.sensorRepository.delete(id);
  }

  /**
   * @description Get history for ONE specific sensor
   */
  public async getHistoryForSensor(id: string, query: GetSensorHistoryQuery) {
    await this.getDetail(id);
    const { total, data } = await this.sensorLogRepository.findHistory(query, id);
    const meta = PaginationMetaDto.create(query.page, query.limit, total);

    return { data, meta };
  }

  /**
   * @description Get global history for ALL sensors, safely scoped by query.airportId
   */
  public async getAllHistory(query: GetSensorHistoryQuery) {
    const { total, data } = await this.sensorLogRepository.findHistory(query);
    const meta = PaginationMetaDto.create(query.page, query.limit, total);

    return { data, meta };
  }

  /**
   * @description History for one sensor over a period, at raw / hourly / daily granularity.
   * Backs the sensor datatable and history chart. `auto` picks:
   *   <= 6 h inside the raw window -> raw, <= 3 days -> hourly, otherwise daily.
   */
  public async getSeries(id: string, query: GetSensorSeriesQuery) {
    await this.getDetail(id);

    const HOUR_MS = 60 * 60 * 1000;
    const start = new Date(query.startDate);
    const end = new Date(query.endDate);
    const rangeHours = (end.getTime() - start.getTime()) / HOUR_MS;
    const rawAvailable = start.getTime() >= Date.now() - env.SENSOR_RAW_RETENTION_HOURS * HOUR_MS;
    const MAX_HOURLY_RANGE_HOURS = 62 * 24; // ~1,500 rows

    let granularity = query.granularity;
    if (granularity === 'auto') {
      granularity = rangeHours <= 6 && rawAvailable ? 'raw' : rangeHours <= 72 ? 'hour' : 'day';
    }
    if (granularity === 'raw' && (!rawAvailable || rangeHours > env.SENSOR_RAW_RETENTION_HOURS)) {
      throw new AppError(
        400,
        `Raw samples are only kept for the last ${env.SENSOR_RAW_RETENTION_HOURS} hours. Use hourly or daily granularity.`,
        ERROR_CODES.COMMON.VALIDATION_ERROR
      );
    }
    if (granularity === 'hour' && rangeHours > MAX_HOURLY_RANGE_HOURS) {
      throw new AppError(
        400,
        'Hourly granularity supports ranges up to 62 days. Use daily granularity.',
        ERROR_CODES.COMMON.VALIDATION_ERROR
      );
    }

    const rows: SensorSeriesRow[] =
      granularity === 'raw'
        ? await this.sensorLogRepository.findRawSeries(id, start, end)
        : granularity === 'hour'
          ? await this.sensorLogRepository.findHourlySeries(id, start, end)
          : await this.sensorLogRepository.findDailySeries(id, start, end, query.tz);

    // Numeric columns can arrive as strings/bigints from raw SQL; normalise them
    const normalized = rows.map((r) => ({
      bucket: new Date(r.bucket).toISOString(),
      min: Number(r.min),
      max: Number(r.max),
      avg: Number(r.avg),
      count: Number(r.count),
    }));

    const total = normalized.reduce((n, r) => n + r.count, 0);
    const summary = total
      ? {
          samples: total,
          min: Math.min(...normalized.map((r) => r.min)),
          max: Math.max(...normalized.map((r) => r.max)),
          avg: normalized.reduce((sum, r) => sum + r.avg * r.count, 0) / total,
          first: normalized[0]!.bucket,
          last: normalized[normalized.length - 1]!.bucket,
        }
      : { samples: 0, min: null, max: null, avg: null, first: null, last: null };

    return {
      sensorId: id,
      granularity,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      tz: query.tz,
      retention: {
        rawHours: env.SENSOR_RAW_RETENTION_HOURS,
        rollupDays: env.SENSOR_ROLLUP_RETENTION_DAYS,
      },
      summary,
      rows: normalized,
    };
  }

  public getMetadata() {
    return {
      types: SENSOR_TYPES,
      statuses: SENSOR_STATUSES,
    };
  }
}
