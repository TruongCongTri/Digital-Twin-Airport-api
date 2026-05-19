import { Router } from 'express';
import { SensorController } from './sensor.controller';
import { validate } from '@/middlewares/validate.middleware';
import {
  createSensorSchema,
  getSensorHistoryQuerySchema,
  getSensorsQuerySchema,
  updateSensorSchema,
} from './sensor.schema';
import { ENDPOINTS } from '@/constants/endpoints';
import { getIDSchema } from '@/common/schemas/reusable.schema';

/**
 * @class SensorRoute
 * @description Registers all RESTful endpoints, injects Zod validation middlewares,
 * and maintains strict path precedence to prevent routing conflicts.
 */
export class SensorRoute {
  public router: Router;
  private readonly sensorController: SensorController;

  /**
   * Init Route with Dependency Injection (DI)
   */
  constructor(controller?: SensorController) {
    this.router = Router();
    this.sensorController = controller || new SensorController();

    this.initializeRoutes();
  }

  private initializeRoutes() {
    // [POST] CREATE NEW Sensor
    this.router.post(
      ENDPOINTS.SENSOR.GET_ALL,
      validate(createSensorSchema),
      this.sensorController.create
    );

    // [GET] GET ALL Sensor (With Filtering & Pagination)
    this.router.get(
      ENDPOINTS.SENSOR.GET_ALL,
      validate(getSensorsQuerySchema),
      this.sensorController.getAll
    );

    // [GET] GET HISTORY FOR ALL SENSORS
    // Note: Place this BEFORE the /:id routes to prevent Express from thinking "logs" is an ID
    this.router.get(
      ENDPOINTS.SENSOR.GLOBAL_HISTORY,
      validate(getSensorHistoryQuerySchema),
      this.sensorController.getAllHistory
    );

    // [GET] METADATA (Types & Statuses for UI)
    this.router.get(ENDPOINTS.SENSOR.TYPES, this.sensorController.getMetadata);

    // [GET] GET DETAILS OF Sensor BY ID
    this.router.get(
      ENDPOINTS.SENSOR.DETAIL,
      validate(getIDSchema),
      this.sensorController.getDetail
    );

    // [GET] GET HISTORY FOR A SPECIFIC SENSOR
    this.router.get(
      ENDPOINTS.SENSOR.HISTORY,
      validate(getIDSchema), // Validates the :id param
      validate(getSensorHistoryQuerySchema), // Validates the ?page=1&startDate=... query
      this.sensorController.getHistoryForSensor
    );

    // [PATCH] UPDATE Sensor BY ID
    this.router.patch(
      ENDPOINTS.SENSOR.DETAIL,
      validate(getIDSchema),
      validate(updateSensorSchema),
      this.sensorController.update
    );

    // [DELETE] DELETE Sensor BY ID
    this.router.delete(
      ENDPOINTS.SENSOR.DETAIL,
      validate(getIDSchema),
      this.sensorController.delete
    );
  }
}

// Export default instance of Route to be used in main route configuration
export default new SensorRoute().router;
