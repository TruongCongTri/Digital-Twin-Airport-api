/**
 * @file flight.route.ts
 * @description Express router configuration for the Aviation Operations module.
 * Maps HTTP endpoints to controller methods and enforces strict Zod validation
 * middleware BEFORE any request reaches the application logic.
 */
import { Router } from 'express';
import { FlightController } from './flight.controller';
import { validate } from '@/middlewares/validate.middleware';
import {
  addTelemetrySchema,
  allocateParkingSchema,
  createFlightSchema,
  getFlightsQuerySchema,
  updateFlightStatusSchema,
} from './flight.schema';
import { ENDPOINTS } from '@/constants/endpoints';
import { getIDSchema } from '@/common/schemas/reusable.schema';

/**
 * @class FlightRoute
 * @description Registers all RESTful endpoints, injects Zod validation middlewares,
 * and maintains strict path precedence to prevent routing conflicts.
 */
export class FlightRoute {
  public router: Router;
  private readonly flightController: FlightController;

  /**
   * @constructor
   * @param controller Optional dependency injection for testing. Defaults to a new instance.
   */
  constructor(controller?: FlightController) {
    this.router = Router();
    this.flightController = controller || new FlightController();

    this.initializeRoutes();
  }

  /**
   * @method initializeRoutes
   * @description Mounts all flight-related endpoints to the Express router.
   * Note the strict middleware ordering: Always validate URL params (getIDSchema)
   * before validating the complex request body.
   */
  private initializeRoutes() {
    // =========================================================
    // CORE FLIGHT OPERATIONS
    // =========================================================

    /**
     * @route POST /api/v1/flights
     * @description Registers a new scheduled flight.
     */
    this.router.post(
      ENDPOINTS.FLIGHT.GET_ALL, // Maps to '/'
      validate(createFlightSchema),
      this.flightController.create
    );

    /**
     * @route GET /api/v1/flights
     * @description Fetches the paginated dispatcher manifest.
     */
    this.router.get(
      ENDPOINTS.FLIGHT.GET_ALL,
      validate(getFlightsQuerySchema),
      this.flightController.getAll
    );

    // 2. STATIC/SPECIFIC ROUTES (MUST BE PLACED BEFORE /:id ROUTES)
    // [GET] /api/v1/flights/active
    this.router.get(
      ENDPOINTS.FLIGHT.ACTIVE,
      validate(getFlightsQuerySchema),
      this.flightController.getActive
    );

    // 3. DYNAMIC ID ROUTES
    // [GET] /api/v1/flights/:id
    this.router.get(
      ENDPOINTS.FLIGHT.DETAIL,
      validate(getIDSchema),
      this.flightController.getDetail
    );

    // =========================================================
    // STATE & RESOURCE MANAGEMENT
    // =========================================================

    /**
     * @route PATCH /api/v1/flights/:id/status
     * @description Transitions a flight through its physical lifecycle.
     */
    this.router.patch(
      ENDPOINTS.FLIGHT.STATUS, // Maps to '/:id/status'
      validate(getIDSchema),
      validate(updateFlightStatusSchema),
      this.flightController.updateStatus
    );

    /**
     * @route POST /api/v1/flights/:id/allocation
     * @description Assigns a physical parking stand to the aircraft.
     */
    this.router.post(
      ENDPOINTS.FLIGHT.ALLOCATION, // Maps to '/:id/allocation'
      validate(getIDSchema),
      validate(allocateParkingSchema),
      this.flightController.allocateParking
    );

    // =========================================================
    // DIGITAL TWIN TELEMETRY
    // =========================================================

    /**
     * @route POST /api/v1/flights/:id/telemetry
     * @description Ingests high-frequency GPS data for the ArcGIS 3D Map.
     */
    this.router.post(
      ENDPOINTS.FLIGHT.TELEMETRY, // Maps to '/:id/telemetry'
      validate(getIDSchema),
      validate(addTelemetrySchema),
      this.flightController.addTelemetry
    );

    // [GET] /api/v1/flights/:id/telemetry (Retrieve GPS History)
    this.router.get(
      ENDPOINTS.FLIGHT.TELEMETRY,
      validate(getIDSchema),
      this.flightController.getTelemetryHistory
    );
  }
}

// Export default instance of Route to be used in main route configuration
export default new FlightRoute().router;
