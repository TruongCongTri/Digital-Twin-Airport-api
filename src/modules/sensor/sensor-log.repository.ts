import { Prisma, SensorLog, SensorType } from '@/generated/index';
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
}
