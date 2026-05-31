import { Prisma, SensorLog, SensorType } from '@/generated/client';
import { BaseRepository } from '@/common/repositories/base.repository';
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
    // 1. Explicitly build the Where object to satisfy exactOptionalPropertyTypes
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

    // 2. Build the nested Sensor relation filter safely
    if (sensorId === undefined && (query.type !== undefined || query.zoneId !== undefined)) {
      const sensorFilter: Prisma.SensorWhereInput = {};

      if (query.type !== undefined) {
        sensorFilter.type = query.type as SensorType; // Cast string to exact Prisma Enum
      }

      if (query.zoneId !== undefined) {
        sensorFilter.zoneId = query.zoneId;
      }

      where.sensor = sensorFilter;
    }

    // 3. Execute query
    return await this.executePagination<SensorLog>({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { timestamp: 'desc' }, // Newest logs first
      include: {
        sensor: {
          select: { name: true, type: true, zoneId: true },
        },
      },
    });
  }
}
