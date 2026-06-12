import { GroundVehicleRepository } from './ground-vehicle.repository';
import {
  CreateVehicleDTO,
  UpdateVehicleStatusDTO,
  AddVehicleTelemetryDTO,
  GetVehiclesQuery,
} from './ground-vehicle.schema';
import { AppError } from '@/common/errors/app.error';
import { socketConfig } from '@/common/configs/socket';
import { PaginationMetaDto } from '@/data/dtos/pagination.dto';
import { VehicleStatus } from '@/generated/index';

export class GroundVehicleService {
  private readonly vehicleRepository: GroundVehicleRepository;

  constructor() {
    this.vehicleRepository = new GroundVehicleRepository();
  }

  public async create(data: CreateVehicleDTO) {
    return await this.vehicleRepository.create(data);
  }

  public async getAll(query: GetVehiclesQuery) {
    const { total, data } = await this.vehicleRepository.findManyWithPagination(query);
    const meta = PaginationMetaDto.create(query.page, query.limit, total);
    return { data, meta };
  }

  public async updateStatus(id: string, data: UpdateVehicleStatusDTO) {
    const vehicle = await this.vehicleRepository.findById(id);
    if (!vehicle) throw new AppError(404, 'Ground Vehicle not found');

    const updated = await this.vehicleRepository.updateStatus(id, data.status as VehicleStatus);

    // Broadcast status change to clients
    socketConfig.getIO().emit('vehicle:status-changed', updated);

    return updated;
  }

  public async addTelemetry(id: string, data: AddVehicleTelemetryDTO) {
    const vehicle = await this.vehicleRepository.findById(id);
    if (!vehicle) throw new AppError(404, 'Ground Vehicle not found');

    if (vehicle.status === 'MAINTENANCE' || vehicle.status === 'OFFLINE') {
      throw new AppError(400, `Cannot accept telemetry for a vehicle in ${vehicle.status} state.`);
    }

    const telemetry = await this.vehicleRepository.addTelemetry(id, data);

    // Broadcast live GPS data to the ArcGIS 3D Map
    socketConfig.getIO().emit('vehicle:telemetry', {
      vehicleId: id,
      callsign: vehicle.callsign,
      type: vehicle.type,
      ...data,
      timestamp: telemetry.timestamp,
    });

    return telemetry;
  }

  public async getTelemetryHistory(id: string) {
    const vehicle = await this.vehicleRepository.findById(id);
    if (!vehicle) throw new AppError(404, 'Ground Vehicle not found');

    return await this.vehicleRepository.getTelemetryHistory(id);
  }
}
