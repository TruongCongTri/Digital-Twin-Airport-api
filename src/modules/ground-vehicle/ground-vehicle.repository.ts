import { Prisma, VehicleStatus, VehicleType, GroundVehicle } from '@/generated/index';
import { prisma } from '@/common/configs/prisma';
import { BaseRepository } from '@/common/repositories/base.repository';
import {
  AddVehicleTelemetryDTO,
  CreateVehicleDTO,
  GetVehiclesQuery,
} from './ground-vehicle.schema';

export class GroundVehicleRepository extends BaseRepository<GroundVehicle> {
  constructor() {
    super('groundVehicle');
  }

  public async create(data: CreateVehicleDTO) {
    return await prisma.groundVehicle.create({
      data: {
        callsign: data.callsign,
        type: data.type as VehicleType,
        status: (data.status as VehicleStatus) || 'IDLE',
        airportId: data.airportId,
      },
    });
  }

  public async findManyWithPagination(query: GetVehiclesQuery) {
    const where: Prisma.GroundVehicleWhereInput = {};

    if (query.type) where.type = query.type as VehicleType;
    if (query.status) where.status = query.status as VehicleStatus;

    if (query.airportId) {
      where.OR = [{ airportId: query.airportId }, { airport: { code: query.airportId } }];
    }

    return await this.executePagination<GroundVehicle>({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { callsign: 'asc' },
    });
  }

  public async updateStatus(id: string, status: VehicleStatus) {
    return await prisma.groundVehicle.update({
      where: { id },
      data: { status },
    });
  }

  public async addTelemetry(vehicleId: string, data: AddVehicleTelemetryDTO) {
    return await prisma.vehicleTelemetry.create({
      data: {
        vehicleId,
        longitude: data.longitude,
        latitude: data.latitude,
        speed: data.speed,
        ...(data.batteryLevel !== undefined && { batteryLevel: data.batteryLevel }),
      },
    });
  }

  public async getTelemetryHistory(vehicleId: string) {
    return await prisma.vehicleTelemetry.findMany({
      where: { vehicleId },
      orderBy: { timestamp: 'desc' },
      take: 100, // Limit for performance
    });
  }
}
