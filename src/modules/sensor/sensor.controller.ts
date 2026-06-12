import { Request, Response } from 'express';
import { SensorService } from './sensor.service';
import { successResponse } from '@/common/utils/responses/api-response';
import { MESSAGES } from '@/constants/messages';
import { RESOURCES } from '@/constants/resources';
import {
  CreateSensorDTO,
  UpdateSensorDTO,
  GetSensorsQuery,
  GetSensorHistoryQuery,
} from './sensor.schema';

/**
 * @class SensorController
 * @description Bridges the Express HTTP layer and the underlying Service logic.
 * Assumes a global async-error handler wrapper is active in the Express app.
 */
export class SensorController {
  private readonly sensorService: SensorService;

  constructor() {
    this.sensorService = new SensorService();
  }

  public getStaticSensors = async (req: Request, res: Response) => {
    try {
      // ✅ Extract airportId from query parameters (e.g., ?airportId=VVTS)
      const airportId = req.query.airportId as string | undefined;
      const data = await this.sensorService.getStaticSensors(airportId);

      successResponse(res, {
        statusCode: 200,
        message: 'Static sensor metadata retrieved successfully.',
        data,
      });
    } catch (error: any) {
      console.error('🔥 [Sensor Controller] Crash:', error.message);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  /**
   * @description [POST] Extracts body and initiates event creation.
   */
  public create = async (req: Request, res: Response) => {
    const payload = req.body as CreateSensorDTO;
    const data = await this.sensorService.create(payload);

    successResponse(res, {
      statusCode: 201,
      message: MESSAGES.COMMON.SUCCESS.CREATED(RESOURCES.SENSOR),
      data,
    });
  };

  /**
   *  @description [GET] Get all Sensor
   */
  public getAll = async (req: Request, res: Response) => {
    const query = req.query as unknown as GetSensorsQuery;
    const { data, meta } = await this.sensorService.getAll(query);

    successResponse(res, {
      statusCode: 200,
      message: MESSAGES.COMMON.SUCCESS.FETCHED(RESOURCES.SENSOR),
      data,
      meta,
    });
  };

  /**
   * @description [GET] Get details Sensor
   */
  public getDetail = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const data = await this.sensorService.getDetail(id);

    successResponse(res, {
      statusCode: 200,
      message: MESSAGES.COMMON.SUCCESS.FETCHED(RESOURCES.SENSOR),
      data,
    });
  };

  /**
   *  @description [PATCH] Update Sensor
   */
  public update = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const payload = req.body as UpdateSensorDTO;
    const data = await this.sensorService.update(id, payload);

    successResponse(res, {
      statusCode: 200,
      message: MESSAGES.COMMON.SUCCESS.UPDATED(RESOURCES.SENSOR),
      data,
    });
  };

  /**
   * @description [DELETE] Delete Sensor
   */
  public delete = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await this.sensorService.delete(id);

    successResponse(res, {
      statusCode: 200,
      message: MESSAGES.COMMON.SUCCESS.DELETED(RESOURCES.SENSOR),
    });
  };

  public getHistoryForSensor = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const query = req.query as unknown as GetSensorHistoryQuery;

    const { data, meta } = await this.sensorService.getHistoryForSensor(id, query);

    successResponse(res, {
      statusCode: 200,
      message: MESSAGES.COMMON.SUCCESS.FETCHED(RESOURCES.SENSOR),
      data,
      meta,
    });
  };

  public getAllHistory = async (req: Request, res: Response) => {
    const query = req.query as unknown as GetSensorHistoryQuery;

    const { data, meta } = await this.sensorService.getAllHistory(query);

    successResponse(res, {
      statusCode: 200,
      message: MESSAGES.COMMON.SUCCESS.FETCHED(RESOURCES.SENSOR),
      data,
      meta,
    });
  };

  public getMetadata = async (_req: Request, res: Response) => {
    const data = this.sensorService.getMetadata();

    successResponse(res, {
      statusCode: 200,
      message: MESSAGES.COMMON.SUCCESS.FETCHED(RESOURCES.SENSOR),
      data,
    });
  };
}
