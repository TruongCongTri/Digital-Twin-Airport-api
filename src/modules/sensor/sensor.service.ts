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
   * @description Create new Sensor
   */
  public async create(data: CreateSensorDTO) {
    // Note: Foreign key validation (zoneId) is inherently handled by Prisma throwing a P2003 error,
    // which the global error-handler maps to a 404 or 400 automatically.
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
    // Optionally include the Zone relation so the client knows exactly where it is
    const result = await this.sensorRepository.findById(id, { include: { zone: true } });

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
    // 1. Verify existence
    await this.getDetail(id);

    // 2. Call Repository to update
    return await this.sensorRepository.updateById(id, data);
  }

  /**
   * @description Delete Sensor by ID
   */
  public async delete(id: string) {
    // 1. Verify existence
    await this.getDetail(id);

    // 2. Call Repository to delete
    return await this.sensorRepository.delete(id);
  }

  /**
   * @description Get history for ONE specific sensor
   */
  public async getHistoryForSensor(id: string, query: GetSensorHistoryQuery) {
    // 1. Verify the sensor exists first
    await this.getDetail(id);

    // 2. Fetch its logs
    const { total, data } = await this.sensorLogRepository.findHistory(query, id);
    const meta = PaginationMetaDto.create(query.page, query.limit, total);

    return { data, meta };
  }

  /**
   * @description Get global history for ALL sensors (Useful for AI aggregate training)
   */
  public async getAllHistory(query: GetSensorHistoryQuery) {
    const { total, data } = await this.sensorLogRepository.findHistory(query);
    const meta = PaginationMetaDto.create(query.page, query.limit, total);

    return { data, meta };
  }

  /**
   * @description Returns static metadata for frontend UI dropdowns
   */
  public getMetadata() {
    return {
      types: SENSOR_TYPES,
      statuses: SENSOR_STATUSES,
    };
  }
}
