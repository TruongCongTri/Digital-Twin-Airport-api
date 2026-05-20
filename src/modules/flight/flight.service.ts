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

export class FlightService {
  private readonly flightRepository: FlightRepository;

  constructor() {
    this.flightRepository = new FlightRepository();
  }

  /**
   * @method create
   * @description Registers a new scheduled flight into the system.
   * @param data Validated flight metadata (airline, origin, destination)
   * @returns The newly created flight object
   */
  public async create(data: CreateFlightDTO) {
    return await this.flightRepository.create(data);
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
    // Prevent illogical jumps (e.g., 'SCHEDULED' directly to 'PARKED')
    this.validateStatusTransition(flight.status, newStatus);

    // 2. RESOURCE CLEANUP (Gate Release)
    // Release the gate immediately when the plane leaves it (Pushback/Taxiing out/Departed/Cancelled)
    const gateReleasingStatuses: FlightStatus[] = ['PUSHBACK', 'TAXIING', 'DEPARTED', 'CANCELLED'];

    // Ensure we only release it if it's an OUTBOUND taxi, not an INBOUND taxi.
    // If current status is PARKED or BOARDING, they are leaving the gate.
    if (gateReleasingStatuses.includes(newStatus) && flight.parkingStandId) {
      if (flight.status === 'PARKED' || flight.status === 'BOARDING') {
        await this.flightRepository.releaseParkingStandTx(id, flight.parkingStandId);
      }
      // If DEPARTED or CANCELLED, always release just to be safe
      else if (newStatus === 'DEPARTED' || newStatus === 'CANCELLED') {
        await this.flightRepository.releaseParkingStandTx(id, flight.parkingStandId);
      }
    }

    // 3. APPLY UPDATE
    const updated = await this.flightRepository.update(id, { status: newStatus });

    // 4. BROADCAST EVENT
    // Instantly notify the Next.js UI to update the Dispatcher Dashboard
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

    // 1. COLLISION CHECK
    // If the stand is occupied, and the occupant IS NOT this exact flight, reject it.
    if (stand.isOccupied && flight.parkingStandId !== stand.id) {
      throw new AppError(
        409,
        `Parking stand ${stand.code} is currently occupied by another aircraft.`
      );
    }

    // 2. EXECUTE ATOMIC TRANSFER
    // Handles safely freeing the old gate (if moving) and locking the new one
    await this.flightRepository.allocateParkingStandTx(id, stand.id, flight.parkingStandId);

    // Fetch the newly updated flight with its new stand details
    const updatedFlight = await this.flightRepository.findByIdWithDetails(id);

    // Broadcast to the UI so all dispatchers see the gate turn "Occupied" instantly
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

    // Physics & State Validation
    if (flight.status === 'CANCELLED') {
      throw new AppError(400, 'Cannot accept telemetry for a cancelled flight.');
    }
    if (flight.status === 'PARKED' && data.speed > 5) {
      throw new AppError(
        409,
        'Anomaly detected: Parked aircraft cannot broadcast movement speeds above 5 knots.'
      );
    }

    // 1. SAVE TO DATABASE (For historical playback later)
    const telemetry = await this.flightRepository.addTelemetry(id, data);

    // 2. THE WOW FACTOR (Real-time 3D Engine update)
    // Send data to Next.js so the ArcGIS 3D plane glides smoothly across the map
    socketConfig.getIO().emit('flight:telemetry', {
      flightId: id,
      flightNumber: flight.flightNumber,
      status: flight.status,
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
    // Verify flight exists first
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
    // If the status isn't changing, do nothing
    if (current === target) return;

    // A cancelled or departed flight is closed. It cannot be resurrected.
    if (current === 'CANCELLED' || current === 'DEPARTED' || current === 'DIVERTED') {
      throw new AppError(400, `Cannot change status of a ${current} flight.`);
    }

    // Strict sequential transitions (Simplified for Phase 1 Demo)
    const validNextStates: Record<FlightStatus, FlightStatus[]> = {
      SCHEDULED: ['APPROACHING', 'CANCELLED'],
      DELAYED: ['APPROACHING', 'CANCELLED'], // Can recover from delay
      APPROACHING: ['LANDED', 'DIVERTED', 'CANCELLED'], // Weather forces diversion
      LANDED: ['TAXIING', 'CANCELLED'],
      TAXIING: ['PARKED', 'DEPARTED', 'CANCELLED'], // Taxiing back to gate after aborting takeoff
      PARKED: ['BOARDING', 'PUSHBACK', 'CANCELLED'], // Mechanical failure at gate
      BOARDING: ['PUSHBACK', 'CANCELLED', 'DELAYED'], // Passenger medical emergency, flight aborted
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
