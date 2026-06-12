import { SensorRepository } from './sensor.repository';
import { SensorLogRepository } from './sensor-log.repository';
import {
  CreateSensorDTO,
  GetSensorsQuery,
  UpdateSensorDTO,
  GetSensorHistoryQuery,
  SENSOR_TYPES,
  SENSOR_STATUSES,
} from './sensor.schema';
import { AppError } from '@/common/errors/app.error';
import { ERROR_CODES } from '@/constants/error-codes';
import { MESSAGES } from '@/constants/messages';
import { RESOURCES } from '@/constants/resources';
import { PaginationMetaDto } from '@/data/dtos/pagination.dto';
import redisClient from '@/common/services/redis.service';
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

  public getMetadata() {
    return {
      types: SENSOR_TYPES,
      statuses: SENSOR_STATUSES,
    };
  }
}
