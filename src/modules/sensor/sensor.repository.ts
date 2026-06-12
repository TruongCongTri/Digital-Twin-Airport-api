import { Prisma, Sensor, SensorStatus, SensorType } from '@/generated/index';
import { prisma } from '@/common/configs/prisma';
import { BaseRepository } from '@/common/repositories/base.repository';
import { CreateSensorDTO, GetSensorsQuery, UpdateSensorDTO } from './sensor.schema';

/**
 * @class SensorRepository
 * @description Handles raw database interactions for the Sensor domain.
 */
export class SensorRepository extends BaseRepository<Prisma.SensorDelegate> {
  constructor() {
    // inject Prisma client delegate for Sensor model
    super('sensor');
  }

  public async getStaticSensors(airportId?: string) {
    const where: Prisma.SensorWhereInput = {};

    if (airportId) {
      where.OR = [{ airportId: airportId }, { airport: { code: airportId } }];
    }

    return await prisma.sensor.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        x: true,
        y: true,
        z: true,
        zone: {
          select: {
            id: true,
            name: true,
          },
        },
        imageUrl: true,
      },
    });
  }

  /**
   * @method create
   * @description Create a new Sensor record mapped to a Zone
   *
   * @param data - The validated Sensor payload
   * @returns The created Sensor record
   */
  public async create(data: CreateSensorDTO) {
    return await prisma.sensor.create({
      data: {
        name: data.name,
        type: data.type as SensorType,
        x: data.x,
        y: data.y,
        z: data.z,
        zoneId: data.zoneId,
        airportId: data.airportId,
        ...(data.status && { status: data.status as SensorStatus }),
      },
    });
  }

  /**
   * @method findManyWithPagination
   * @description Utilizes the BaseRepository executor for paginated, filtered queries
   */
  public async findManyWithPagination(query: GetSensorsQuery) {
    const where: Prisma.SensorWhereInput = {
      ...(query.type && { type: query.type as SensorType }),
      ...(query.status && { status: query.status as SensorStatus }),
      ...(query.zoneId && { zoneId: query.zoneId }),
    };

    if (query.airportId) {
      where.OR = [{ airportId: query.airportId }, { airport: { code: query.airportId } }];
    }

    return await this.executePagination<Sensor>({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * @method updateById
   * @description Update a Sensor record by ID
   *
   * @param id - The strictly validated UUID of the Sensor record
   * @param data - The partial data payload to update
   * @returns The updated Sensor record
   */
  public async updateById(id: string, data: UpdateSensorDTO) {
    const updateData: Prisma.SensorUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.type !== undefined) updateData.type = data.type as SensorType;
    if (data.status !== undefined) updateData.status = data.status as SensorStatus;
    if (data.x !== undefined) updateData.x = data.x;
    if (data.y !== undefined) updateData.y = data.y;
    if (data.z !== undefined) updateData.z = data.z;

    if (data.zoneId !== undefined) {
      updateData.zone = { connect: { id: data.zoneId } };
    }
    if (data.airportId !== undefined) {
      updateData.airport = { connect: { id: data.airportId } };
    }

    return await prisma.sensor.update({
      where: { id },
      data: updateData,
    });
  }
}
