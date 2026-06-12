import { Prisma, FlightStatus, ParkingStand, Flight } from '@/generated/index';
import { prisma } from '@/common/configs/prisma';
import { BaseRepository } from '@/common/repositories/base.repository';
import { AddTelemetryDTO, CreateFlightDTO, GetFlightsQuery } from './flight.schema';

type FlightWithParkingStand = Prisma.FlightGetPayload<{
  include: { parkingStand: true };
}>;

export class FlightRepository extends BaseRepository<Flight> {
  constructor() {
    super('flight');
  }

  public async getStaticMetadata(airportId?: string) {
    const where: Prisma.FlightWhereInput = {};

    if (airportId) {
      where.OR = [{ airportId: airportId }, { airport: { code: airportId } }];
    }

    return await prisma.flight.findMany({
      where,
      select: {
        id: true,
        flightNumber: true,
        airline: true,
        origin: true,
        destination: true,
        logoUrl: true,
        imageUrl: true,
      },
    });
  }

  /**
   * @method create
   * @description Creates a new scheduled flight. (Status defaults to SCHEDULED in DB)
   */
  public async create(data: CreateFlightDTO) {
    return await prisma.flight.create({
      data: {
        flightNumber: data.flightNumber,
        airline: data.airline,
        origin: data.origin,
        destination: data.destination,
        airportId: data.airportId,
      },
    });
  }

  /**
   * @method findManyWithPagination
   * @description Fetches flights with optional filtering, joining the ParkingStand data.
   */
  public async findManyWithPagination(query: GetFlightsQuery) {
    const where: Prisma.FlightWhereInput = {};

    if (query.status !== undefined) where.status = query.status as FlightStatus;
    if (query.airline !== undefined)
      where.airline = { contains: query.airline, mode: 'insensitive' };

    if (query.airportId) {
      where.OR = [{ airportId: query.airportId }, { airport: { code: query.airportId } }];
    }

    return await this.executePagination<FlightWithParkingStand>({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { updatedAt: 'desc' },
      include: { parkingStand: true }, // Include gate data for the UI
    });
  }

  /**
   * @method getParkingStandById
   * @description Fetches a parking stand by its ID.
   */
  public async getParkingStandById(id: string): Promise<ParkingStand | null> {
    return await prisma.parkingStand.findUnique({ where: { id } });
  }

  /**
   * @method findActiveSurfaceFlights
   * @description Fetches ONLY flights physically on the ground for the 3D Map, with pagination.
   */
  public async getActiveSurfaceFlights(query: GetFlightsQuery) {
    const where: Prisma.FlightWhereInput = {
      status: {
        in: ['LANDED', 'TAXIING', 'PARKED', 'BOARDING', 'PUSHBACK'],
      },
    };

    if (query.airportId) {
      where.OR = [{ airportId: query.airportId }, { airport: { code: query.airportId } }];
    }

    return await this.executePagination({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { updatedAt: 'desc' },
      include: { parkingStand: true },
    });
  }

  /**
   * @method allocateParkingStandTx
   * @description Safe atomic transaction to assign a gate and update occupancy statuses
   */
  public async allocateParkingStandTx(
    flightId: string,
    newStandId: string,
    oldStandId: string | null
  ) {
    const operations: Prisma.PrismaPromise<any>[] = [];

    // 1. If the flight was at a previous gate, free it up
    if (oldStandId && oldStandId !== newStandId) {
      operations.push(
        prisma.parkingStand.update({
          where: { id: oldStandId },
          data: { isOccupied: false },
        })
      );
    }

    // 2. Mark the new gate as occupied
    operations.push(
      prisma.parkingStand.update({
        where: { id: newStandId },
        data: { isOccupied: true },
      })
    );

    // 3. Link the gate to the flight
    operations.push(
      prisma.flight.update({
        where: { id: flightId },
        data: { parkingStandId: newStandId },
      })
    );

    // Execute all or nothing
    return await prisma.$transaction(operations);
  }

  /**
   * @method releaseParkingStandTx
   * @description Safely detaches a flight from a gate and marks the gate as free.
   */
  public async releaseParkingStandTx(flightId: string, standId: string) {
    return await prisma.$transaction([
      prisma.parkingStand.update({
        where: { id: standId },
        data: { isOccupied: false },
      }),
      prisma.flight.update({
        where: { id: flightId },
        data: { parkingStandId: null },
      }),
    ]);
  }

  /**
   * @method addTelemetry
   * @description Logs a high-frequency GPS ping for the ArcGIS 3D map
   */
  public async addTelemetry(flightId: string, data: AddTelemetryDTO) {
    return await prisma.flightTelemetry.create({
      data: {
        flightId,
        longitude: data.longitude,
        latitude: data.latitude,
        altitude: data.altitude,
        heading: data.heading,
        speed: data.speed,
      },
    });
  }

  /**
   * @method findActiveFlights
   * @description Fetches paginated flights currently interacting with the airport.
   * Allows searching by airline and filtering by specific active statuses.
   */
  public async findActiveFlights(query: GetFlightsQuery) {
    const activeStatuses: FlightStatus[] = [
      'APPROACHING',
      'LANDED',
      'TAXIING',
      'PARKED',
      'BOARDING',
      'PUSHBACK',
    ];

    const where: Prisma.FlightWhereInput = {};

    // Only apply specific status if it is actually in the active list
    if (query.status !== undefined && activeStatuses.includes(query.status as FlightStatus)) {
      where.status = query.status as FlightStatus;
    } else {
      // Otherwise, grab all active flights
      where.status = { in: activeStatuses };
    }

    if (query.airline !== undefined) {
      where.airline = { contains: query.airline, mode: 'insensitive' };
    }

    if (query.airportId) {
      where.OR = [{ airportId: query.airportId }, { airport: { code: query.airportId } }];
    }

    return await this.executePagination<FlightWithParkingStand>({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { updatedAt: 'desc' },
      include: { parkingStand: true },
    });
  }

  /**
   * @method findByIdWithDetails
   * @description Gets a single flight with its gate assignment.
   */
  public async findByIdWithDetails(id: string) {
    return await prisma.flight.findUnique({
      where: { id },
      include: { parkingStand: true },
    });
  }

  /**
   * @method getTelemetryHistory
   * @description Retrieves the GPS breadcrumb trail for a specific flight.
   * Limits to the last 500 points to prevent browser memory crashes on the frontend.
   */
  public async getTelemetryHistory(flightId: string) {
    return await prisma.flightTelemetry.findMany({
      where: { flightId },
      orderBy: { timestamp: 'desc' },
      take: 500,
    });
  }
}
