import { Router } from 'express';
import { SimulationController } from './simulation.controller';
import { ENDPOINTS } from '@/constants/endpoints';
import { triggerScenarioSchema } from './simulation.schema';
import { validate } from '@/middlewares/validate.middleware';

export class SimulationRoute {
  public router: Router;
  private readonly simulationController: SimulationController;

  constructor() {
    this.router = Router();
    this.simulationController = new SimulationController();
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post(ENDPOINTS.SIMULATION.START, this.simulationController.start);

    this.router.post(ENDPOINTS.SIMULATION.STOP, this.simulationController.stop);

    this.router.post(
      ENDPOINTS.SIMULATION.SCENARIO,
      validate(triggerScenarioSchema),
      this.simulationController.triggerScenario
    );
  }
}

export default new SimulationRoute().router;
