/**
 * @file flight.service.ts
 * @description Core business logic for Aviation Operations.
 * Handles state machine transitions, collision prevention for parking stands,
 * and broadcasting live telemetry to the Digital Twin 3D map.
 */
import { FlightRepository } from './flight.repository';
import {
  CreateFlightDTO,
  UpdateFlightStatusDTO,
  AllocateParkingDTO,
  AddTelemetryDTO,
  GetFlightsQuery,
} from './flight.schema';
import { AppError } from '@/common/errors/app.error';
import { socketConfig } from '@/common/configs/socket';
import { FlightStatus } from '@/generated/client';
import { PaginationMetaDto } from '@/data/dtos/pagination.dto';
import redisClient from '@/common/services/redis.service';

export class FlightService {
  private readonly flightRepository: FlightRepository;

  constructor() {
    this.flightRepository = new FlightRepository();
  }

  /**
   * @method getStaticMetadata
   * @description Fetches low-mutation flight profile data, isolated by airport context.
   */
  public async getStaticMetadata(airportId?: string) {
    const cacheKey = `static:flights:metadata:${airportId || 'global'}`;

    try {
      // 1. Check Redis First (O(1) Speed)
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (error) {
      console.warn('[Redis] Cache read failed, falling back to DB', error);
    }

    // 2. Fallback to DB (Passes airportId context down to Prisma layer)
    const flights = await this.flightRepository.getStaticMetadata(airportId);

    try {
      // 3. Save to Redis (Cache for 1 Hour)
      await redisClient.setEx(cacheKey, 3600, JSON.stringify(flights));
    } catch (error) {
      console.warn('[Redis] Cache write failed', error);
    }

    return flights;
  }

  /**
   * @method create
   * @description Registers a new scheduled flight into the system.
   * @param data Validated flight metadata (airline, origin, destination)
   * @returns The newly created flight object
   */
  public async create(data: CreateFlightDTO) {
    const newFlight = await this.flightRepository.create(data);

    const cacheKey = `static:flights:metadata:${data.airportId}`;
    try {
      await redisClient.del(cacheKey);
    } catch (error) {
      console.warn(`[Redis] Failed to clear cache key: ${cacheKey}`, error);
    }

    return newFlight;
  }

  /**
   * @method getAll
   * @description Retrieves a paginated list of flights, useful for the Dispatcher UI table.
   * @param query Search filters (status, airline) and pagination (page, limit)
   * @returns Paginated data and metadata
   */
  public async getAll(query: GetFlightsQuery) {
    const { total, data } = await this.flightRepository.findManyWithPagination(query);
    const meta = PaginationMetaDto.create(query.page, query.limit, total);
    return { data, meta };
  }

  /**
   * @method getActive
   * @description Returns paginated flights currently on the tarmac or in the airspace.
   */
  public async getActive(query: GetFlightsQuery) {
    const { total, data } = await this.flightRepository.findActiveFlights(query);
    const meta = PaginationMetaDto.create(query.page, query.limit, total);
    return { data, meta };
  }

  /**
   * @method getDetail
   * @description Retrieves detailed information for a single flight.
   */
  public async getDetail(id: string) {
    const flight = await this.flightRepository.findByIdWithDetails(id);
    if (!flight) throw new AppError(404, 'Flight not found');
    return flight;
  }

  /**
   * @description Fetches ONLY flights physically on the ground for the 3D Map
   */
  public async getActiveSurfaceFlights(query: GetFlightsQuery) {
    const { total, data } = await this.flightRepository.getActiveSurfaceFlights(query);
    const meta = PaginationMetaDto.create(query.page, query.limit, total);

    return { data, meta };
  }

  /**
   * @method updateStatus
   * @description Advances a flight through its lifecycle using a strict State Machine.
   * @param id The UUID of the flight
   * @param data The new target status
   * @throws AppError 400 if the transition is physically impossible
   * @returns The updated flight object
   */
  public async updateStatus(id: string, data: UpdateFlightStatusDTO) {
    const flight = await this.flightRepository.findById(id);
    if (!flight) throw new AppError(404, 'Flight not found');

    const newStatus = data.status as FlightStatus;

    // 1. STATE MACHINE VALIDATION
    this.validateStatusTransition(flight.status, newStatus);

    // 2. RESOURCE CLEANUP (Gate Release)
    const gateReleasingStatuses: FlightStatus[] = ['PUSHBACK', 'DEPARTED', 'CANCELLED', 'DIVERTED'];
    if (gateReleasingStatuses.includes(newStatus) && flight.parkingStandId) {
      await this.flightRepository.releaseParkingStandTx(id, flight.parkingStandId);
      socketConfig
        .getIO()
        .emit('flight:allocation-changed', { flightId: id, parkingStandId: null });
    }

    // 3. DEDUCE DIRECTION FROM STATE MACHINE
    let updatedDirection: any = undefined;

    if (['SCHEDULED', 'APPROACHING', 'LANDED'].includes(newStatus)) {
      updatedDirection = 'INBOUND';
    } else if (['PARKED', 'BOARDING'].includes(newStatus)) {
      updatedDirection = 'TURNAROUND';
    } else if (['PUSHBACK', 'DEPARTED'].includes(newStatus)) {
      updatedDirection = 'OUTBOUND';
    } else if (newStatus === 'TAXIING') {
      if (flight.status === 'LANDED') updatedDirection = 'INBOUND';
      if (flight.status === 'PUSHBACK') updatedDirection = 'OUTBOUND';
    }

    // 4. APPLY UPDATE
    const updatePayload: any = { status: newStatus };
    if (updatedDirection) {
      updatePayload.direction = updatedDirection;
    }

    const updated = await this.flightRepository.update(id, updatePayload);

    // 5. BROADCAST EVENT
    socketConfig.getIO().emit('flight:status-changed', updated);

    return updated;
  }

  /**
   * @method allocateParking
   * @description Assigns a flight to a specific physical gate or tarmac stand.
   * @param id The UUID of the flight
   * @param data The target parking stand UUID
   * @throws AppError 409 if the gate is already occupied (Collision Prevention)
   */
  public async allocateParking(id: string, data: AllocateParkingDTO) {
    const flight = await this.flightRepository.findById(id);
    if (!flight) throw new AppError(404, 'Flight not found');

    const stand = await this.flightRepository.getParkingStandById(data.parkingStandId);
    if (!stand) throw new AppError(404, 'Parking stand not found');

    if (stand.isOccupied && flight.parkingStandId !== stand.id) {
      throw new AppError(
        409,
        `Parking stand ${stand.code} is currently occupied by another aircraft.`
      );
    }

    await this.flightRepository.allocateParkingStandTx(id, stand.id, flight.parkingStandId);
    const updatedFlight = await this.flightRepository.findByIdWithDetails(id);
    socketConfig.getIO().emit('flight:allocation-changed', updatedFlight);

    return { message: `Flight successfully allocated to stand ${stand.code}` };
  }

  /**
   * @method addTelemetry
   * @description Ingests high-frequency GPS ping from an aircraft and broadcasts it to the UI.
   * @param id The UUID of the flight
   * @param data Spatial coordinates (lat, long, alt, speed, heading)
   */
  public async addTelemetry(id: string, data: AddTelemetryDTO) {
    const flight = await this.flightRepository.findById(id);
    if (!flight) throw new AppError(404, 'Flight not found');

    if (flight.status === 'CANCELLED') {
      throw new AppError(400, 'Cannot accept telemetry for a cancelled flight.');
    }
    if (flight.status === 'PARKED' && data.speed > 5) {
      throw new AppError(
        409,
        'Anomaly detected: Parked aircraft cannot broadcast movement speeds above 5 knots.'
      );
    }

    const telemetry = await this.flightRepository.addTelemetry(id, data);

    socketConfig.getIO().emit('flight:telemetry', {
      flightId: id,
      flightNumber: flight.flightNumber,
      status: flight.status,
      dir: flight.direction,
      ...data,
      timestamp: telemetry.timestamp,
    });

    return telemetry;
  }

  /**
   * @method getTelemetryHistory
   * @description Retrieves the historical GPS path for UI rendering.
   */
  public async getTelemetryHistory(id: string) {
    const flight = await this.flightRepository.findById(id);
    if (!flight) throw new AppError(404, 'Flight not found');

    return await this.flightRepository.getTelemetryHistory(id);
  }

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  /**
   * @method validateStatusTransition
   * @description Ensures the physical reality of a plane's lifecycle is respected.
   */
  private validateStatusTransition(current: FlightStatus, target: FlightStatus) {
    if (current === target) return;

    if (current === 'CANCELLED' || current === 'DEPARTED' || current === 'DIVERTED') {
      throw new AppError(400, `Cannot change status of a ${current} flight.`);
    }

    const validNextStates: Record<FlightStatus, FlightStatus[]> = {
      SCHEDULED: ['APPROACHING', 'CANCELLED'],
      DELAYED: ['APPROACHING', 'CANCELLED'],
      APPROACHING: ['LANDED', 'DIVERTED', 'CANCELLED'],
      LANDED: ['TAXIING', 'CANCELLED'],
      TAXIING: ['PARKED', 'DEPARTED', 'CANCELLED'],
      PARKED: ['BOARDING', 'PUSHBACK', 'CANCELLED'],
      BOARDING: ['PUSHBACK', 'CANCELLED', 'DELAYED'],
      PUSHBACK: ['TAXIING', 'CANCELLED'],
      DEPARTED: [],
      DIVERTED: [],
      CANCELLED: [],
    };

    if (!validNextStates[current].includes(target)) {
      throw new AppError(
        400,
        `Invalid transition: Cannot move flight from ${current} directly to ${target}.`
      );
    }
  }
}
