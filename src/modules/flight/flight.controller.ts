/**
 * @file flight.controller.ts
 * @description HTTP interface for Aviation Operations.
 * Extracts validated payloads from Express requests, explicitly casts them to strict DTOs,
 * passes them to the FlightService, and formats standardized API responses.
 */
import { Request, Response } from 'express';
import { FlightService } from './flight.service';
import { successResponse } from '@/common/utils/responses/api-response';
import { MESSAGES } from '@/constants/messages';
import { RESOURCES } from '@/constants/resources';
import {
  CreateFlightDTO,
  UpdateFlightStatusDTO,
  AllocateParkingDTO,
  AddTelemetryDTO,
  GetFlightsQuery,
} from './flight.schema';

export class FlightController {
  private readonly flightService: FlightService;

  constructor() {
    this.flightService = new FlightService();
  }

  public getStaticMetadata = async (_req: Request, res: Response) => {
    try {
      const data = await this.flightService.getStaticMetadata();

      successResponse(res, {
        statusCode: 200,
        message: 'Static flight metadata retrieved successfully.',
        data,
      });
    } catch (error: any) {
      // ✅ This will print the EXACT reason it is crashing to your backend terminal
      console.error('🔥 [Flight Controller] Crash:', error.message);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  /**
   * @method create
   * @route POST /api/v1/flights
   * @description Registers a new flight schedule.
   */
  public create = async (req: Request, res: Response) => {
    // Strictly cast the body to the Zod-validated DTO
    const payload = req.body as CreateFlightDTO;

    const data = await this.flightService.create(payload);

    successResponse(res, {
      statusCode: 201,
      message: MESSAGES.COMMON.SUCCESS.CREATED(RESOURCES.FLIGHT),
      data,
    });
  };

  /**
   * @method getAll
   * @route GET /api/v1/flights
   * @description Retrieves the dispatcher's paginated flight manifest.
   */
  public getAll = async (req: Request, res: Response) => {
    // Cast query through unknown first due to Express ParsedQs type constraints
    const query = req.query as unknown as GetFlightsQuery;

    const { data, meta } = await this.flightService.getAll(query);

    successResponse(res, {
      statusCode: 200,
      message: MESSAGES.COMMON.SUCCESS.FETCHED(RESOURCES.FLIGHT),
      data,
      meta,
    });
  };

  /**
   * @method getActive
   * @route GET /api/v1/flights/active
   */
  public getActive = async (req: Request, res: Response) => {
    const query = req.query as unknown as GetFlightsQuery;

    const { data, meta } = await this.flightService.getActiveSurfaceFlights(query);

    successResponse(res, {
      statusCode: 200,
      message: 'Active flights retrieved successfully.',
      data,
      meta,
    });
  };

  /**
   * @method getDetail
   * @route GET /api/v1/flights/:id
   */
  public getDetail = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const data = await this.flightService.getDetail(id);

    successResponse(res, {
      statusCode: 200,
      message: MESSAGES.COMMON.SUCCESS.FETCHED(RESOURCES.FLIGHT),
      data,
    });
  };

  /**
   * @method updateStatus
   * @route PATCH /api/v1/flights/:id/status
   * @description Advances a flight's lifecycle state (e.g., TAXIING to PARKED).
   */
  public updateStatus = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const payload = req.body as UpdateFlightStatusDTO;

    const data = await this.flightService.updateStatus(id, payload);

    successResponse(res, {
      statusCode: 200,
      message: MESSAGES.COMMON.SUCCESS.UPDATED(RESOURCES.FLIGHT),
      data,
    });
  };

  /**
   * @method allocateParking
   * @route POST /api/v1/flights/:id/allocation
   * @description Secures a parking stand/gate for an incoming or taxiing aircraft.
   */
  public allocateParking = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const payload = req.body as AllocateParkingDTO;

    // Service returns a specific success message (e.g., "Allocated to Stand V1")
    const data = await this.flightService.allocateParking(id, payload);

    successResponse(res, {
      statusCode: 200,
      message: data.message,
    });
  };

  /**
   * @method addTelemetry
   * @route POST /api/v1/flights/:id/telemetry
   * @description Ingests real-time GPS coordinates to move the aircraft on the 3D map.
   */
  public addTelemetry = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const payload = req.body as AddTelemetryDTO;

    const data = await this.flightService.addTelemetry(id, payload);

    successResponse(res, {
      statusCode: 201,
      message: MESSAGES.COMMON.SUCCESS.CREATED(RESOURCES.TELEMETRY),
      data,
    });
  };

  /**
   * @method getTelemetryHistory
   * @route GET /api/v1/flights/:id/telemetry
   */
  public getTelemetryHistory = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const data = await this.flightService.getTelemetryHistory(id);

    successResponse(res, {
      statusCode: 200,
      message: MESSAGES.COMMON.SUCCESS.FETCHED(RESOURCES.TELEMETRY),
      data,
    });
  };
}
