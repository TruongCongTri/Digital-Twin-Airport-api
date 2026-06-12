import { Request, Response } from 'express';
import { ZoneService } from './zone.service';
import { successResponse } from '@/common/utils/responses/api-response';
import { MESSAGES } from '@/constants/messages';
import { RESOURCES } from '@/constants/resources';
import { CreateZoneDTO, UpdateZoneDTO, GetZonesQuery } from './zone.schema';

/**
 * @class ZoneController
 * @description Bridges the Express HTTP layer and the underlying Service logic.
 * Assumes a global async-error handler wrapper is active in the Express app.
 */
export class ZoneController {
  private readonly zoneService: ZoneService;

  constructor() {
    this.zoneService = new ZoneService();
  }

  public getStaticZones = async (req: Request, res: Response) => {
    try {
      // ✅ Extract airportId context from query parameter mapping
      const airportId = req.query.airportId as string | undefined;
      const data = await this.zoneService.getStaticZones(airportId);

      successResponse(res, {
        statusCode: 200,
        message: 'Static zone metadata retrieved successfully.',
        data,
      });
    } catch (error: any) {
      console.error('🔥 [Zone Controller] Crash:', error.message);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  /**
   * @description [POST] Extracts body and initiates event creation.
   */
  public create = async (req: Request, res: Response) => {
    const payload = req.body as CreateZoneDTO;
    const data = await this.zoneService.create(payload);

    successResponse(res, {
      statusCode: 201,
      message: MESSAGES.COMMON.SUCCESS.CREATED(RESOURCES.ZONE),
      data,
    });
  };

  /**
   *  @description [GET] Get all Zone
   */
  public getAll = async (req: Request, res: Response) => {
    const query = req.query as unknown as GetZonesQuery;

    const { data, meta } = await this.zoneService.getAll(query);

    successResponse(res, {
      statusCode: 200,
      message: MESSAGES.COMMON.SUCCESS.FETCHED(RESOURCES.ZONE),
      data,
      meta,
    });
  };

  /**
   * @description [GET] Get details Zone
   */
  public getById = async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const data = await this.zoneService.getById(id);

    successResponse(res, {
      statusCode: 200,
      message: MESSAGES.COMMON.SUCCESS.FETCHED(RESOURCES.ZONE),
      data,
    });
  };

  /**
   *  @description [PATCH] Update Zone
   */
  public update = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const payload = req.body as UpdateZoneDTO;

    const data = await this.zoneService.update(id, payload);

    successResponse(res, {
      statusCode: 200,
      message: MESSAGES.COMMON.SUCCESS.UPDATED(RESOURCES.ZONE),
      data,
    });
  };

  public delete = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await this.zoneService.delete(id);

    successResponse(res, {
      statusCode: 200,
      message: MESSAGES.COMMON.SUCCESS.DELETED(RESOURCES.ZONE),
    });
  };

  /**
   * @description Analytics endpoint that generates AI-based insights for a specific Zone.
   */
  public getAnalytics = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const data = await this.zoneService.getAnalytics(id);

    successResponse(res, {
      statusCode: 200,
      message: 'AI Zone Analytics generated successfully.',
      data,
    });
  };
}
