import { Request, Response } from 'express';
import { SimulationService } from './simulation.service';
import { successResponse } from '@/common/utils/responses/api-response';
import { TriggerScenarioDTO } from './simulation.schema';

export class SimulationController {
  private readonly simulationService: SimulationService;

  constructor() {
    // Inject the Singleton instance
    this.simulationService = SimulationService.getInstance();
  }

  public start = async (_req: Request, res: Response) => {
    const data = await this.simulationService.start();
    successResponse(res, { message: data.message, data });
  };

  public stop = async (_req: Request, res: Response) => {
    const data = this.simulationService.stop();
    successResponse(res, { message: data.message, data });
  };

  public triggerScenario = async (req: Request, res: Response) => {
    const payload = req.body as TriggerScenarioDTO;

    const data = this.simulationService.triggerScenario(payload.scenario);

    successResponse(res, {
      statusCode: 200,
      message: data.message,
      data,
    });
  };
}
