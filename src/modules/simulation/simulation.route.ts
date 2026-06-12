/**
 * @file simulation.route.ts
 * @description Express router configuration for the Master Simulation Engine.
 */
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
    this.bootDaemon();
  }

  private initializeRoutes() {
    this.router.post(ENDPOINTS.SIMULATION.START, this.simulationController.start);
    this.router.post(ENDPOINTS.SIMULATION.STOP, this.simulationController.stop);
    this.router.post(ENDPOINTS.SIMULATION.REBOOT, this.simulationController.reboot);

    this.router.get(ENDPOINTS.SIMULATION.STATUS, this.simulationController.getStatus);

    this.router.post(
      ENDPOINTS.SIMULATION.SCENARIO,
      validate(triggerScenarioSchema),
      this.simulationController.triggerScenario
    );
  }

  private bootDaemon() {
    console.log(
      '[SimulationRoute] Auto-rebooting multi-tenant simulation daemon on server boot...'
    );

    // ✅ Calls reboot instead of start to wipe any ghost states (from VVLT or VVTS) on application load
    this.simulationController.simulationService
      .reboot()
      .then((res) => {
        console.log(`[SimulationRoute] Daemon initialization succeeded: ${res.message}`);
      })
      .catch((err: any) => {
        console.error('[SimulationRoute] Failed to cleanly auto-reboot daemon on boot:', err);
      });
  }
}

export default new SimulationRoute().router;
