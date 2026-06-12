import { Router } from 'express';
import { GroundVehicleController } from './ground-vehicle.controller';
import { validate } from '@/middlewares/validate.middleware';
import { getIDSchema } from '@/common/schemas/reusable.schema';
import {
  createVehicleSchema,
  getVehiclesQuerySchema,
  updateVehicleStatusSchema,
  addVehicleTelemetrySchema,
} from './ground-vehicle.schema';

export class GroundVehicleRoute {
  public router: Router;
  private readonly controller: GroundVehicleController;

  constructor() {
    this.router = Router();
    this.controller = new GroundVehicleController();
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post('/', validate(createVehicleSchema), this.controller.create);
    this.router.get('/', validate(getVehiclesQuerySchema), this.controller.getAll);

    this.router.get('/:id', validate(getIDSchema), this.controller.getVehicleById);

    this.router.patch(
      '/:id/status',
      validate(getIDSchema),
      validate(updateVehicleStatusSchema),
      this.controller.updateStatus
    );

    this.router.post(
      '/:id/telemetry',
      validate(getIDSchema),
      validate(addVehicleTelemetrySchema),
      this.controller.addTelemetry
    );

    this.router.get('/:id/telemetry', validate(getIDSchema), this.controller.getTelemetryHistory);
  }
}

export default new GroundVehicleRoute().router;
