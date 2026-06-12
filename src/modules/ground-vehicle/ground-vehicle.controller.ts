import { Request, Response } from 'express';
import { GroundVehicleService } from './ground-vehicle.service';
import { successResponse } from '@/common/utils/responses/api-response';
import {
  CreateVehicleDTO,
  UpdateVehicleStatusDTO,
  AddVehicleTelemetryDTO,
  GetVehiclesQuery,
} from './ground-vehicle.schema';

export class GroundVehicleController {
  private readonly vehicleService: GroundVehicleService;

  constructor() {
    this.vehicleService = new GroundVehicleService();
  }

  public create = async (req: Request, res: Response) => {
    const payload = req.body as CreateVehicleDTO;
    const data = await this.vehicleService.create(payload);
    successResponse(res, { statusCode: 201, message: 'Vehicle created', data });
  };

  public getAll = async (req: Request, res: Response) => {
    const query = req.query as unknown as GetVehiclesQuery;
    const { data, meta } = await this.vehicleService.getAll(query);
    successResponse(res, { statusCode: 200, message: 'Vehicles fetched', data, meta });
  };

  // ✅ New Controller Method
  public getVehicleById = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const data = await this.vehicleService.getVehicleDetail(id);
    successResponse(res, { statusCode: 200, message: 'Vehicle details fetched', data });
  };

  public updateStatus = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const payload = req.body as UpdateVehicleStatusDTO;
    const data = await this.vehicleService.updateStatus(id, payload);
    successResponse(res, { statusCode: 200, message: 'Status updated', data });
  };

  public addTelemetry = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const payload = req.body as AddVehicleTelemetryDTO;
    const data = await this.vehicleService.addTelemetry(id, payload);
    successResponse(res, { statusCode: 201, message: 'Telemetry logged', data });
  };

  public getTelemetryHistory = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const data = await this.vehicleService.getTelemetryHistory(id);
    successResponse(res, { statusCode: 200, message: 'History fetched', data });
  };
}
