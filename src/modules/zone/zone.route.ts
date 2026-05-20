import { Router } from 'express';
import { ZoneController } from './zone.controller';
import { validate } from '@/middlewares/validate.middleware';
import { ENDPOINTS } from '@/constants/endpoints';
import { getIDSchema } from '@/common/schemas/reusable.schema';
import { createZoneSchema, updateZoneSchema, getZonesQuerySchema } from './zone.schema';

/**
 * @class ZoneRoute
 * @description Registers all RESTful endpoints, injects Zod validation middlewares,
 * and maintains strict path precedence to prevent routing conflicts.
 */
export class ZoneRoute {
  public router: Router;
  private readonly zoneController: ZoneController;

  /**
   * Init Route with Dependency Injection (DI)
   */
  constructor(controller?: ZoneController) {
    this.router = Router();
    this.zoneController = controller || new ZoneController();

    this.initializeRoutes();
  }

  private initializeRoutes() {
    // [POST] Create a new Zone
    this.router.post(
      ENDPOINTS.ZONE.GET_ALL,
      validate(createZoneSchema),
      this.zoneController.create
    );

    // [GET] List all Zones
    this.router.get(
      ENDPOINTS.ZONE.GET_ALL,
      validate(getZonesQuerySchema),
      this.zoneController.getAll
    );

    // [GET] AI Analytics & Chart Data (MUST be before /:id)
    this.router.get(
      ENDPOINTS.ZONE.ANALYTICS,
      validate(getIDSchema),
      this.zoneController.getAnalytics
    );

    // [GET] Single Zone Details + Deployed Hardware
    this.router.get(ENDPOINTS.ZONE.DETAIL, validate(getIDSchema), this.zoneController.getById);

    // [PATCH] Update Zone (e.g., to attach ArcGIS gisItemId later)
    this.router.patch(
      ENDPOINTS.ZONE.DETAIL,
      validate(getIDSchema),
      validate(updateZoneSchema),
      this.zoneController.update
    );

    // [DELETE] Remove a Zone (Protected by hardware constraints)
    this.router.delete(ENDPOINTS.ZONE.DETAIL, validate(getIDSchema), this.zoneController.delete);
  }
}

// Export default instance of Route to be used in main route configuration
export default new ZoneRoute().router;
