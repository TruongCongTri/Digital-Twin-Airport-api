/**
 * @file simulation.service.ts
 * @description Master Simulation Engine.
 * Handles AI predictive generation, flight kinematics, civilian ground traffic,
 * and environmental scenario injection across all active multi-tenant airports.
 */
import { prisma } from '@/common/configs/prisma';
import { FlightStatus, SensorType, VehicleStatus } from '@/generated/index';
import { socketConfig } from '@/common/configs/socket';
import { FlightService } from '../flight/flight.service';
import { LONG_THANH_COORDS, TAN_SON_NHAT_COORDS } from '@/constants/airport-coordinates';

export type ScenarioType =
  | 'NONE'
  | 'TROPICAL_SQUALL'
  | 'TARMAC_OVERHEAT'
  | 'AC_FAILURE'
  | 'HEAVY_LOAD'
  | 'EARTHQUAKE';

interface FlightSimState {
  id: string;
  flightNumber: string;
  status: FlightStatus;
  direction: 'INBOUND' | 'OUTBOUND' | 'TURNAROUND';
  assignedRunway: string | null;
  lat: number;
  lng: number;
  alt: number;
  speed: number;
  heading: number;
  ticksInState: number;
  route: { lat: number; lng: number }[];
  currentWaypointIndex: number;
  destinationType?: 'TERMINAL' | 'RUNWAY';
  activeRouteId?: string | undefined;
  airportCode: string;
  terminalKey: string;
  gateLat: number;
  gateLng: number;
}

interface VehicleSimState {
  id: string;
  licensePlate: string;
  status: VehicleStatus;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  route: { lat: number; lng: number }[];
  currentWaypointIndex: number;
  airportCode: string;
  ticksInState: number;
}

export class SimulationService {
  private static instance: SimulationService;

  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private currentTick = 0;
  private readonly TICK_RATE_MS = 3000;
  private readonly DB_SAVE_TICK_MODULO = 20;

  private sensorStates: Map<string, { value: number; type: SensorType; airportCode: string }> =
    new Map();
  private flightStates: Map<string, FlightSimState> = new Map();
  private vehicleStates: Map<string, VehicleSimState> = new Map();
  private readonly flightService: FlightService;

  // Enforces 1 Takeoff Runway (OUTBOUND) and 1 Landing Runway (INBOUND) globally for this demo
  private reservedRoutes: Set<string> = new Set();

  private currentVirtualDate: Date = new Date();
  private activeScenario: ScenarioType = 'NONE';
  private scenarioTicksRemaining = 0;

  private constructor() {
    this.flightService = new FlightService();
  }

  public static getInstance(): SimulationService {
    if (!SimulationService.instance) {
      SimulationService.instance = new SimulationService();
    }
    return SimulationService.instance;
  }

  // ✅ Context-Aware Terminal Mapping
  private getTerminalRouteKey(airportCode: string, standCode: string): string {
    if (airportCode === 'VVTS') {
      return standCode.includes('INTL') ? 'INTERNATIONAL' : 'DOMESTIC';
    }
    // Default VVLT
    if (standCode.includes('T2')) return 'T2';
    if (standCode.includes('T3')) return 'T3';
    return 'T1';
  }

  // ✅ Context-Aware Coordinate Fetcher
  private getAirportRoutes(airportCode: string) {
    if (airportCode === 'VVTS') return TAN_SON_NHAT_COORDS.ROUTES;
    return LONG_THANH_COORDS.ROUTES;
  }

  public async start(): Promise<{ message: string }> {
    if (this.isRunning) return { message: 'Simulation engine is already running.' };

    this.currentVirtualDate = new Date();
    const hour = this.currentVirtualDate.getHours();
    const loadMultiplier = this.getPassengerLoadMultiplier(hour);
    const solarMultiplier = this.getSolarIntensityMultiplier(hour);

    // 1. BOOT SENSORS
    const sensors = await prisma.sensor.findMany({
      select: { id: true, type: true, currentValue: true, airport: { select: { code: true } } },
    });

    sensors.forEach((s) => {
      this.sensorStates.set(s.id, {
        type: s.type as SensorType,
        airportCode: s.airport.code,
        value:
          s.currentValue ||
          this.calculateBaseline(s.type as SensorType, loadMultiplier, solarMultiplier),
      });
    });

    // 2. BOOT FLIGHTS
    const activeGroundFlights = await prisma.flight.findMany({
      where: { status: { in: ['LANDED', 'TAXIING', 'PARKED', 'PUSHBACK'] } },
      include: { parkingStand: true, airport: true },
    });

    activeGroundFlights.forEach((f: any) => {
      const airportCode = f.airport.code;
      const isAtGate = f.status === 'PARKED' || f.status === 'PUSHBACK';
      const terminalKey = this.getTerminalRouteKey(airportCode, f.parkingStand?.code || '');
      const routes = this.getAirportRoutes(airportCode) as any;
      const routePaths = routes[terminalKey];

      if (!routePaths) return;

      const isArrival = f.status === 'LANDED' || (f.status === 'TAXIING' && !isAtGate);
      const activeRoute = isArrival ? routePaths.flightInbound : routePaths.flightOutbound;
      const destType: 'TERMINAL' | 'RUNWAY' = isArrival ? 'TERMINAL' : 'RUNWAY';

      if (!activeRoute || activeRoute.length === 0) return;

      const firstPoint = activeRoute[0];
      const lastPoint = activeRoute[activeRoute.length - 1];

      const gateLat = f.parkingStand?.y ?? lastPoint.lat;
      const gateLng = f.parkingStand?.x ?? lastPoint.lng;

      const startPoint = isAtGate ? { lat: gateLat, lng: gateLng } : firstPoint;

      let assignedSpeed = 0;
      let assignedRouteArray: { lat: number; lng: number }[] = [];
      let waypointIndex = 0;
      let activeLock: string | undefined = undefined;

      if (f.status === 'TAXIING' || f.status === 'LANDED' || f.status === 'PUSHBACK') {
        const requiredLock = `${airportCode}_${isArrival ? 'INBOUND' : 'OUTBOUND'}`;
        if (!this.reservedRoutes.has(requiredLock)) {
          this.reservedRoutes.add(requiredLock);
          assignedSpeed = f.status === 'LANDED' ? 35 : f.status === 'PUSHBACK' ? 0 : 20;
          assignedRouteArray = activeRoute;
          waypointIndex = 1;
          activeLock = requiredLock;
        } else {
          f.status = isArrival ? 'APPROACHING' : 'PARKED';
          const newDirection = isArrival ? 'INBOUND' : 'TURNAROUND';

          prisma.flight
            .update({
              where: { id: f.id },
              data: { status: f.status as FlightStatus, direction: newDirection },
            })
            .catch(console.error);
        }
      }

      this.flightStates.set(f.id, {
        id: f.id,
        flightNumber: f.flightNumber,
        status: f.status as FlightStatus,
        direction: (f.direction as any) || (isArrival ? 'INBOUND' : 'OUTBOUND'),
        assignedRunway: 'RWY_05L',
        lat: startPoint.lat,
        lng: startPoint.lng,
        alt: 0,
        speed: assignedSpeed,
        heading: 0,
        ticksInState: 0,
        route: assignedRouteArray,
        currentWaypointIndex: waypointIndex,
        destinationType: destType,
        activeRouteId: activeLock,
        airportCode: airportCode,
        terminalKey: terminalKey,
        gateLat,
        gateLng,
      });
    });

    // 3. BOOT GROUND VEHICLES (CIVILIAN TRAFFIC)
    const groundVehicles = await prisma.groundVehicle.findMany({
      // ✅ Removed the invalid { status: { not: 'OFFLINE' } } where clause
      include: {
        airport: true,
        telemetry: { take: 1, orderBy: { timestamp: 'desc' } },
      },
    });

    groundVehicles.forEach((v: any) => {
      const airportCode = v.airport.code;
      // We assume civilian cars use the standard taxi paths defined for terminals
      const terminalKey = airportCode === 'VVTS' ? 'DOMESTIC' : 'T1';
      const routes = this.getAirportRoutes(airportCode) as any;
      const taxiPath = (routes[terminalKey]?.taxiPath as { lat: number; lng: number }[]) || [];

      // ✅ FIX: Explicitly grab the first item and type-check it for TypeScript
      const firstWaypoint = taxiPath[0];
      if (!firstWaypoint) return;

      const lastTelemetry = v.telemetry && v.telemetry.length > 0 ? v.telemetry[0] : null;

      // ✅ Now TypeScript knows firstWaypoint is safely defined!
      const startLat = lastTelemetry?.latitude ?? firstWaypoint.lat;
      const startLng = lastTelemetry?.longitude ?? firstWaypoint.lng;

      this.vehicleStates.set(v.id, {
        id: v.id,
        licensePlate: v.licensePlate,
        status: v.status as VehicleStatus,
        lat: startLat,
        lng: startLng,
        speed: lastTelemetry?.speed ?? 20,
        heading: lastTelemetry?.heading ?? 0,
        route: taxiPath,
        currentWaypointIndex: 1,
        airportCode,
        ticksInState: 0,
      });
    });

    this.isRunning = true;
    this.intervalId = setInterval(() => this.tick(), this.TICK_RATE_MS);
    return { message: 'Simulation engine started across all facilities.' };
  }

  public stop(): { message: string } {
    if (!this.isRunning) return { message: 'Simulation engine is not running.' };
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    this.activeScenario = 'NONE';
    this.reservedRoutes.clear();
    this.flightStates.clear();
    this.sensorStates.clear();
    this.vehicleStates.clear();

    console.log('[Simulation Engine] HALTED and memory flushed.');
    return { message: 'Simulation engine stopped.' };
  }

  public async reboot(): Promise<{ message: string }> {
    console.log('[Simulation Engine] Rebooting...');
    this.stop();
    await new Promise((resolve) => setTimeout(resolve, 500));
    return await this.start();
  }

  public getStatus() {
    return { isRunning: this.isRunning, activeScenario: this.activeScenario || 'NONE' };
  }

  private async tick() {
    try {
      this.currentTick++;
      const isDbSaveTick = this.currentTick % this.DB_SAVE_TICK_MODULO === 0;
      const io = socketConfig.getIO();

      this.currentVirtualDate.setSeconds(this.currentVirtualDate.getSeconds() + 3);
      this.processScenarioTimeouts();

      const hour = this.currentVirtualDate.getHours();
      const loadMultiplier = this.getPassengerLoadMultiplier(hour);
      const solarMultiplier = this.getSolarIntensityMultiplier(hour);

      if (this.currentTick % 5 === 0) this.simulateAIPredictions(io);

      const dbUpdates = [];
      const logsToInsert = [];

      // --- SENSORS ---
      for (const [id, state] of this.sensorStates.entries()) {
        state.value = this.calculateNextValue(
          state.value,
          state.type,
          loadMultiplier,
          solarMultiplier
        );
        io.emit('sensor:telemetry', { id: id, val: state.value });

        if (isDbSaveTick) {
          dbUpdates.push(
            prisma.sensor.update({
              where: { id },
              data: { currentValue: state.value, lastReadAt: this.currentVirtualDate },
            })
          );
          logsToInsert.push({
            sensorId: id,
            value: state.value,
            timestamp: this.currentVirtualDate,
          });
        }
      }

      // --- FLIGHTS ---
      const flightTelemetryBatch = [];
      const flightLogsToInsert: any[] = [];

      for (const flight of this.flightStates.values()) {
        flight.ticksInState++;
        this.evaluateFlightStateTransition(flight);
        this.calculateNextFlightPosition(flight);

        flightTelemetryBatch.push({
          id: flight.id,
          sts: flight.status,
          dir: flight.direction,
          lat: Number(flight.lat.toFixed(6)),
          lng: Number(flight.lng.toFixed(6)),
          alt: Number(flight.alt.toFixed(0)),
          spd: Number(flight.speed.toFixed(1)),
          hdg: Number(flight.heading.toFixed(0)),
        });

        if (isDbSaveTick) {
          flightLogsToInsert.push({
            flightId: flight.id,
            latitude: flight.lat,
            longitude: flight.lng,
            altitude: flight.alt,
            heading: flight.heading,
            speed: flight.speed,
            timestamp: this.currentVirtualDate,
          });
        }
      }

      // --- VEHICLES ---
      const vehicleTelemetryBatch = [];
      const vehicleLogsToInsert: any[] = [];

      for (const vehicle of this.vehicleStates.values()) {
        vehicle.ticksInState++;
        this.calculateNextVehiclePosition(vehicle);

        vehicleTelemetryBatch.push({
          id: vehicle.id,
          sts: vehicle.status,
          lat: Number(vehicle.lat.toFixed(6)),
          lng: Number(vehicle.lng.toFixed(6)),
          spd: Number(vehicle.speed.toFixed(1)),
          hdg: Number(vehicle.heading.toFixed(0)),
        });

        if (isDbSaveTick) {
          vehicleLogsToInsert.push({
            vehicleId: vehicle.id,
            latitude: vehicle.lat,
            longitude: vehicle.lng,
            speed: vehicle.speed,
            heading: vehicle.heading,
            timestamp: this.currentVirtualDate,
          });
        }
      }

      // --- BATCH EMITS ---
      if (flightTelemetryBatch.length > 0) io.emit('flights:telemetry:batch', flightTelemetryBatch);
      if (vehicleTelemetryBatch.length > 0)
        io.emit('vehicles:telemetry:batch', vehicleTelemetryBatch);

      if (this.currentTick % 10 === 0) {
        await this.manageATCAndPipeline();
      }

      // --- DB FLUSH ---
      if (isDbSaveTick) {
        await prisma.$transaction([
          ...dbUpdates,
          prisma.sensorLog.createMany({ data: logsToInsert }),
          prisma.flightTelemetry.createMany({ data: flightLogsToInsert }),
          prisma.vehicleTelemetry.createMany({ data: vehicleLogsToInsert }),
        ]);

        const oneHourAgo = new Date(this.currentVirtualDate.getTime() - 60 * 60 * 1000);
        await prisma.flightTelemetry.deleteMany({ where: { timestamp: { lt: oneHourAgo } } });
        await prisma.vehicleTelemetry.deleteMany({ where: { timestamp: { lt: oneHourAgo } } });
        await prisma.sensorLog.deleteMany({ where: { timestamp: { lt: oneHourAgo } } });
      }
    } catch (error) {
      console.error('[Simulation Engine] Critical Tick Error:', error);
    }
  }

  private async manageATCAndPipeline() {
    const approachingCount = await prisma.flight.count({ where: { status: 'APPROACHING' } });
    let parkedCount = 0;
    this.flightStates.forEach((f) => {
      if (f.status === 'PARKED' || f.status === 'PUSHBACK') parkedCount++;
    });

    if (approachingCount + parkedCount < 10) {
      const recycledFlight = await prisma.flight.findFirst({
        where: { status: { notIn: ['LANDED', 'TAXIING', 'PARKED', 'PUSHBACK', 'APPROACHING'] } },
        include: { airport: true },
      });

      if (recycledFlight && !this.flightStates.has(recycledFlight.id)) {
        const activeFlights = await prisma.flight.findMany({
          where: {
            status: { in: ['APPROACHING', 'LANDED', 'TAXIING', 'PARKED', 'PUSHBACK'] },
            airportId: recycledFlight.airportId,
          },
        });
        const usedStands = new Set(activeFlights.map((f) => f.parkingStandId).filter(Boolean));
        const allStands = await prisma.parkingStand.findMany({
          where: { zone: { airportId: recycledFlight.airportId } },
        });
        const freeStands = allStands.filter((s) => !usedStands.has(s.id));

        if (freeStands.length > 0) {
          const newStand = freeStands[Math.floor(Math.random() * freeStands.length)];

          if (!newStand) return;

          const terminalKey = this.getTerminalRouteKey(recycledFlight.airport.code, newStand.code);

          if (parkedCount < 6) {
            const routes = this.getAirportRoutes(recycledFlight.airport.code) as any;
            const routePaths = routes[terminalKey];
            const gateSpot = routePaths.flightInbound[routePaths.flightInbound.length - 1];

            if (gateSpot) {
              this.flightStates.set(recycledFlight.id, {
                id: recycledFlight.id,
                flightNumber: recycledFlight.flightNumber,
                status: 'PARKED',
                direction: 'TURNAROUND',
                assignedRunway: null,
                lat: newStand.y,
                lng: newStand.x,
                alt: 0,
                speed: 0,
                heading: 0,
                ticksInState: 0,
                route: [],
                currentWaypointIndex: 0,
                destinationType: 'TERMINAL',
                terminalKey: terminalKey,
                airportCode: recycledFlight.airport.code,
                gateLat: newStand.y,
                gateLng: newStand.x,
              });

              await prisma.flight.update({
                where: { id: recycledFlight.id },
                data: { status: 'PARKED', direction: 'TURNAROUND', parkingStandId: newStand.id },
              });
            }
          } else {
            await prisma.flight.update({
              where: { id: recycledFlight.id },
              data: { status: 'APPROACHING', direction: 'INBOUND', parkingStandId: newStand.id },
            });
          }
        }
      }
    }

    // Process approaching flights sequentially per airport
    const approachingFlight = await prisma.flight.findFirst({
      where: { status: 'APPROACHING' },
      include: { parkingStand: true, airport: true },
    });

    if (approachingFlight && !this.flightStates.has(approachingFlight.id)) {
      const lockKey = `${approachingFlight.airport.code}_INBOUND`;
      if (!this.reservedRoutes.has(lockKey)) {
        this.reservedRoutes.add(lockKey);

        const terminalKey = this.getTerminalRouteKey(
          approachingFlight.airport.code,
          approachingFlight.parkingStand?.code || ''
        );
        const routes = this.getAirportRoutes(approachingFlight.airport.code) as any;
        const route = routes[terminalKey].flightInbound;
        const landingSpot = route[0];

        if (landingSpot) {
          this.flightStates.set(approachingFlight.id, {
            id: approachingFlight.id,
            flightNumber: approachingFlight.flightNumber,
            status: 'LANDED',
            direction: 'INBOUND',
            assignedRunway: 'RWY_05L',
            lat: landingSpot.lat,
            lng: landingSpot.lng,
            alt: 50,
            speed: 55,
            heading: 0,
            ticksInState: 0,
            route: route,
            currentWaypointIndex: 1,
            destinationType: 'TERMINAL',
            activeRouteId: lockKey,
            terminalKey: terminalKey,
            airportCode: approachingFlight.airport.code,
            gateLat: approachingFlight.parkingStand?.y || 0,
            gateLng: approachingFlight.parkingStand?.x || 0,
          });

          await prisma.flight.update({
            where: { id: approachingFlight.id },
            data: { status: 'LANDED', direction: 'INBOUND' },
          });
        }
      }
    }
  }

  private evaluateFlightStateTransition(flight: FlightSimState) {
    if (flight.status === 'LANDED' && flight.ticksInState > 2) {
      flight.direction = 'INBOUND';
      this.changeFlightStatus(flight, 'TAXIING', 20);
    }

    if (flight.status === 'TAXIING' && flight.destinationType === 'TERMINAL') {
      if (flight.currentWaypointIndex >= flight.route.length) {
        flight.direction = 'TURNAROUND';
        this.changeFlightStatus(flight, 'PARKED', 0);
        flight.lat = flight.gateLat;
        flight.lng = flight.gateLng;

        if (flight.activeRouteId) {
          this.reservedRoutes.delete(flight.activeRouteId);
          flight.activeRouteId = undefined;
        }
      }
    }

    const turnaroundThreshold = 25 + Math.random() * 15;

    if (flight.status === 'PARKED' && flight.ticksInState > turnaroundThreshold) {
      const lockKey = `${flight.airportCode}_OUTBOUND`;
      if (!this.reservedRoutes.has(lockKey)) {
        this.reservedRoutes.add(lockKey);
        flight.direction = 'OUTBOUND';
        this.changeFlightStatus(flight, 'PUSHBACK', 0);
        flight.activeRouteId = lockKey;
      }
    }

    if (flight.status === 'PUSHBACK' && flight.ticksInState > 3) {
      flight.direction = 'OUTBOUND';
      this.changeFlightStatus(flight, 'TAXIING', 20);
      flight.destinationType = 'RUNWAY';
      const routes = this.getAirportRoutes(flight.airportCode) as any;
      flight.route = routes[flight.terminalKey].flightOutbound;
      flight.currentWaypointIndex = 1;
    }

    if (flight.status === 'TAXIING' && flight.destinationType === 'RUNWAY') {
      if (flight.currentWaypointIndex >= flight.route.length) {
        if (flight.activeRouteId) {
          this.reservedRoutes.delete(flight.activeRouteId);
          flight.activeRouteId = undefined;
        }
        this.flightService.updateStatus(flight.id, { status: 'DEPARTED' }).catch(console.error);
        this.flightStates.delete(flight.id);
      }
    }
  }

  private calculateNextFlightPosition(flight: FlightSimState) {
    if (flight.speed === 0 || flight.status === 'PARKED') return;
    if (!flight.route || flight.route.length === 0) return;

    const target = flight.route[flight.currentWaypointIndex];
    if (!target) return;

    flight.heading = this.calculateHeading(flight.lat, flight.lng, target.lat, target.lng);
    const headingRad = flight.heading * (Math.PI / 180);
    const distancePerTick = flight.speed * 0.000015;

    flight.lng += Math.cos(headingRad) * distancePerTick;
    flight.lat += Math.sin(headingRad) * distancePerTick;

    const distToTarget = Math.abs(flight.lat - target.lat) + Math.abs(flight.lng - target.lng);

    if (distToTarget <= distancePerTick * 1.5) {
      flight.lat = target.lat;
      flight.lng = target.lng;
      flight.currentWaypointIndex++;
    }
  }

  // ✅ Civilian Vehicle Lifecycle Logic (with TS fix)
  private calculateNextVehiclePosition(vehicle: VehicleSimState) {
    if (!vehicle.route || vehicle.route.length === 0) return;

    // Simulate Drop-off / Pick-up delays
    if (vehicle.status === 'DROPPING_OFF' || vehicle.status === 'PICKING_UP') {
      if (vehicle.ticksInState > 10) {
        vehicle.status = vehicle.status === 'DROPPING_OFF' ? 'EXITING' : 'APPROACHING_DROP_OFF';
        vehicle.speed = 20; // Resume driving
        vehicle.ticksInState = 0;

        // Broadcast state change to database (fire & forget)
        prisma.groundVehicle
          .update({ where: { id: vehicle.id }, data: { status: vehicle.status } })
          .catch(console.error);
      }
      return;
    }

    if (vehicle.status === 'PARKED') return; // Do nothing if parked

    const target = vehicle.route[vehicle.currentWaypointIndex];
    if (!target) return;

    vehicle.heading = this.calculateHeading(vehicle.lat, vehicle.lng, target.lat, target.lng);
    const headingRad = vehicle.heading * (Math.PI / 180);
    const distancePerTick = vehicle.speed * 0.000015;

    vehicle.lng += Math.cos(headingRad) * distancePerTick;
    vehicle.lat += Math.sin(headingRad) * distancePerTick;

    const distToTarget = Math.abs(vehicle.lat - target.lat) + Math.abs(vehicle.lng - target.lng);

    // Reached Waypoint
    if (distToTarget <= distancePerTick * 1.5) {
      vehicle.lat = target.lat;
      vehicle.lng = target.lng;
      vehicle.currentWaypointIndex++;

      // Terminal logic (middle of route)
      if (vehicle.currentWaypointIndex === Math.floor(vehicle.route.length / 2)) {
        vehicle.status = vehicle.status === 'APPROACHING_DROP_OFF' ? 'DROPPING_OFF' : 'PICKING_UP';
        vehicle.speed = 0;
        vehicle.ticksInState = 0;
        prisma.groundVehicle
          .update({ where: { id: vehicle.id }, data: { status: vehicle.status } })
          .catch(console.error);
      }

      // Reached End of Route
      if (vehicle.currentWaypointIndex >= vehicle.route.length) {
        // ✅ FIX: Use strict null check for the starting waypoint array index
        const startPoint = vehicle.route[0];
        if (startPoint) {
          vehicle.currentWaypointIndex = 1;
          vehicle.lat = startPoint.lat;
          vehicle.lng = startPoint.lng;
          vehicle.status = 'APPROACHING_DROP_OFF';
          prisma.groundVehicle
            .update({ where: { id: vehicle.id }, data: { status: vehicle.status } })
            .catch(console.error);
        }
      }
    }
  }

  private changeFlightStatus(flight: FlightSimState, newStatus: FlightStatus, speed: number) {
    flight.status = newStatus;
    flight.speed = speed;
    flight.ticksInState = 0;
    this.flightService.updateStatus(flight.id, { status: newStatus }).catch(console.error);
  }

  private calculateHeading(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const dy = lat2 - lat1;
    const dx = lng2 - lng1;
    let theta = Math.atan2(dy, dx) * (180 / Math.PI);
    if (theta < 0) theta += 360;
    return theta;
  }

  private simulateAIPredictions(io: any) {
    const forecastHorizons = [6, 12, 18, 24, 2190, 4380];
    for (const [id, state] of this.sensorStates.entries()) {
      const predictions = forecastHorizons.map((horizonHours) => {
        const futureDate = new Date(
          this.currentVirtualDate.getTime() + horizonHours * 60 * 60 * 1000
        );
        const futureHour = futureDate.getHours();
        const futureLoad = this.getPassengerLoadMultiplier(futureHour);
        const futureSolar = this.getSolarIntensityMultiplier(futureHour);
        let predictedVal = this.calculateBaseline(state.type, futureLoad, futureSolar);

        let scenarioImpact = 0;
        if (horizonHours <= 6) scenarioImpact = 0.6;
        else if (horizonHours <= 12) scenarioImpact = 0.3;
        else if (horizonHours <= 24) scenarioImpact = 0.1;

        if (this.activeScenario !== 'NONE' && scenarioImpact > 0) {
          if (this.activeScenario === 'HEAVY_LOAD') {
            if (state.type === 'CAMERA_AI_CROWD') predictedVal *= 1 + 2.5 * scenarioImpact;
            if (state.type === 'TEMPERATURE') predictedVal += 5 * scenarioImpact;
            if (state.type === 'CO2') predictedVal += 800 * scenarioImpact;
            if (state.type === 'TILT_STRUCTURAL') predictedVal += 0.01 * scenarioImpact;
          }
          if (this.activeScenario === 'EARTHQUAKE') {
            if (state.type === 'TILT_STRUCTURAL') predictedVal += 0.2 * scenarioImpact;
            if (state.type === 'CAMERA_AI_CROWD')
              predictedVal = Math.max(0, predictedVal - 200 * scenarioImpact);
          }
          if (this.activeScenario === 'TROPICAL_SQUALL') {
            if (state.type === 'WIND_OUTDOOR') predictedVal += 20 * scenarioImpact;
            if (state.type === 'TARMAC_TEMP') predictedVal -= 10 * scenarioImpact;
          }
          if (this.activeScenario === 'AC_FAILURE') {
            if (state.type === 'TEMPERATURE') predictedVal += 8 * scenarioImpact;
            if (state.type === 'CO2') predictedVal += 1000 * scenarioImpact;
          }
        }
        predictedVal += (Math.random() - 0.5) * (predictedVal * 0.1);
        const baseConfidence = Math.max(0.4, 0.95 - (horizonHours / 4380) * 0.5);
        const confidenceScore = Number(
          (baseConfidence + (Math.random() * 0.05 - 0.025)).toFixed(2)
        );
        const finalVal =
          state.type === 'TILT_STRUCTURAL'
            ? Number(predictedVal.toFixed(4))
            : state.type === 'LIGHT_DENSITY' ||
                state.type === 'CO2' ||
                state.type === 'CAMERA_AI_CROWD'
              ? Number(predictedVal.toFixed(0))
              : Number(predictedVal.toFixed(2));

        let horizonLabel = `${horizonHours}H`;
        if (horizonHours === 2190) horizonLabel = 'NEXT QTR';
        if (horizonHours === 4380) horizonLabel = 'NEXT SEASON';

        return {
          timestamp: futureDate.toISOString(),
          horizonLabel,
          predictedValue: Math.max(0, finalVal),
          confidenceScore,
        };
      });
      io.emit('ai:prediction:stream', { sensorId: id, type: state.type, predictions });
    }
  }

  public triggerScenario(scenario: ScenarioType): { message: string } {
    if (!this.isRunning) return { message: 'Simulation must be running to trigger scenarios.' };
    if (scenario === 'NONE') {
      this.activeScenario = 'NONE';
      return { message: 'Returned to normal simulation parameters.' };
    }
    this.activeScenario = scenario;
    switch (scenario) {
      case 'TROPICAL_SQUALL':
        this.scenarioTicksRemaining = 200;
        for (const flight of this.flightStates.values()) {
          if (flight.status === 'APPROACHING') {
            flight.heading = (flight.heading + 90) % 360;
            flight.speed = 220;
          }
        }
        break;
      case 'EARTHQUAKE':
        this.scenarioTicksRemaining = 30;
        break;
      case 'HEAVY_LOAD':
        this.scenarioTicksRemaining = 300;
        break;
      case 'TARMAC_OVERHEAT':
        this.scenarioTicksRemaining = 150;
        for (const state of this.sensorStates.values()) {
          if (state.type === 'TARMAC_TEMP') state.value = 65.5;
        }
        break;
      case 'AC_FAILURE':
        this.scenarioTicksRemaining = 150;
        break;
    }
    this.tick();
    return { message: `Scenario [${scenario}] active.` };
  }

  private processScenarioTimeouts() {
    if (this.activeScenario !== 'NONE') {
      this.scenarioTicksRemaining--;
      if (this.scenarioTicksRemaining <= 0) {
        console.log(`[SCENARIO] 🛑 ${this.activeScenario} has concluded.`);
        this.activeScenario = 'NONE';
      }
    }
  }

  private getPassengerLoadMultiplier(hour: number): number {
    if (hour >= 6 && hour <= 10) return 0.8 + Math.random() * 0.2;
    if (hour >= 20 && hour <= 23) return 0.9 + Math.random() * 0.1;
    if (hour >= 1 && hour <= 4) return 0.1 + Math.random() * 0.1;
    return 0.4 + Math.random() * 0.2;
  }

  private getSolarIntensityMultiplier(hour: number): number {
    if (hour < 6 || hour > 18) return 0;
    const phase = ((hour - 6) / 12) * Math.PI;
    return Math.sin(phase);
  }

  private calculateBaseline(type: SensorType, load: number, solar: number): number {
    switch (type) {
      case 'CO2':
        return 400 + load * 600;
      case 'TEMPERATURE':
        return 23.0 + load * 1.5;
      case 'HUMIDITY':
        return 50 + load * 10;
      case 'WIND_OUTDOOR':
        return 3.0;
      case 'TARMAC_TEMP':
        return 26.0 + solar * 32.0;
      case 'WIND_INDOOR':
        return 0.2 + load * 0.4;
      case 'CAMERA_AI_CROWD':
        return Math.floor(load * 500);
      case 'LIGHT_DENSITY':
        return solar * 900 < 450 ? 450 : solar * 900;
      case 'TILT_STRUCTURAL':
        return solar * 0.004;
      default:
        return 0;
    }
  }

  private calculateNextValue(
    current: number,
    type: SensorType,
    load: number,
    solar: number
  ): number {
    let target = this.calculateBaseline(type, load, solar);
    if (this.activeScenario === 'TROPICAL_SQUALL') {
      if (type === 'WIND_OUTDOOR') target = 25.0;
      if (type === 'TARMAC_TEMP') target = Math.max(28.0, target - 15.0);
      if (type === 'HUMIDITY') target = 95.0;
    }
    if (this.activeScenario === 'HEAVY_LOAD') {
      if (type === 'TEMPERATURE') target += 4.5;
      if (type === 'CO2') target += 800;
      if (type === 'CAMERA_AI_CROWD') target *= 3.5;
      if (type === 'TILT_STRUCTURAL') target += 0.015;
    }
    if (this.activeScenario === 'EARTHQUAKE') {
      if (type === 'TILT_STRUCTURAL') return current + Math.random() * 0.08;
      if (type === 'WIND_INDOOR') target += 2.0;
      if (type === 'CAMERA_AI_CROWD') target = Math.max(0, target - 200);
    }
    if (this.activeScenario === 'AC_FAILURE') {
      if (type === 'TEMPERATURE') target = 32.0;
      if (type === 'CO2') target = 1800;
    }

    const difference = target - current;
    const step = difference * (type === 'LIGHT_DENSITY' ? 0.8 : 0.05);
    let noiseLimit = 0.1;
    if (type === 'CO2') noiseLimit = 3.0;
    if (type === 'CAMERA_AI_CROWD') noiseLimit = 20.0;
    if (type === 'TILT_STRUCTURAL') noiseLimit = 0.0005;

    const noise = (Math.random() - 0.5) * noiseLimit;
    const nextValue = Math.max(0, current + step + noise);

    if (type === 'TILT_STRUCTURAL') return Number(nextValue.toFixed(4));
    if (type === 'LIGHT_DENSITY' || type === 'CO2' || type === 'CAMERA_AI_CROWD')
      return Number(nextValue.toFixed(0));

    return Number(nextValue.toFixed(2));
  }
}
