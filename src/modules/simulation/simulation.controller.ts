import { Request, Response } from 'express';
import { ScenarioType, SimulationService } from './simulation-v2.service';
import { successResponse } from '@/common/utils/responses/api-response';
import { TriggerScenarioDTO } from './simulation.schema';

export class SimulationController {
  public readonly simulationService: SimulationService;

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
  public reboot = async (_req: Request, res: Response) => {
    const data = await this.simulationService.reboot();
    successResponse(res, { message: data.message, data });
  };

  public getStatus = (_req: Request, res: Response) => {
    const data = this.simulationService.getStatus();
    successResponse(res, { message: 'Status retrieved', data });
  };

  public forcePipeline = async (req: Request, res: Response): Promise<void> => {
    const { airportCode } = req.body;

    if (!airportCode) {
      res.status(400).json({ success: false, message: 'airportCode is required' });
      return; // ✅ Fix: Explicit empty return matches Promise<void>
    }

    const data = await this.simulationService.forcePipeline(airportCode);
    successResponse(res, { statusCode: 200, message: 'Pipeline executed', data });
  };

  public triggerScenario = async (req: Request, res: Response) => {
    const payload = req.body as TriggerScenarioDTO;

    // Strict type casting to ensure it matches our Service's expected Enum
    const data = this.simulationService.triggerScenario(payload.scenario as ScenarioType);

    successResponse(res, {
      statusCode: 200,
      message: data.message,
      data,
    });
  };
}
