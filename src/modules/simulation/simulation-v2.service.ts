import { prisma } from '@/common/configs/prisma';
import { FlightStatus, SensorType } from '@/generated/client';
import { socketConfig } from '@/common/configs/socket';
import { FlightService } from '../flight/flight.service';
import { LONG_THANH_COORDS } from '@/constants/airport-coordinates';

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
  terminal: 'T1' | 'T2' | 'T3';
  gateLat: number;
  gateLng: number;
}

export class SimulationService {
  private static instance: SimulationService;

  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private currentTick = 0;
  private readonly TICK_RATE_MS = 3000;
  private readonly DB_SAVE_TICK_MODULO = 20;

  private sensorStates: Map<string, { value: number; type: SensorType }> = new Map();
  private flightStates: Map<string, FlightSimState> = new Map();
  private readonly flightService: FlightService;

  // Enforces 1 Takeoff Runway (OUTBOUND) and 1 Landing Runway (INBOUND)
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

  // Parses exact gate codes (e.g. T1_RIGHT -> T1) to enforce terminal-specific routing
  private getTerminalForFlight(flight: any): 'T1' | 'T2' | 'T3' {
    const code = (flight.parkingStand?.code || '').toUpperCase();
    if (code.includes('T2')) return 'T2';
    if (code.includes('T3')) return 'T3';
    return 'T1';
  }

  public async start(): Promise<{ message: string }> {
    if (this.isRunning) return { message: 'Simulation engine is already running.' };

    const sensors = await prisma.sensor.findMany({
      select: { id: true, type: true, currentValue: true },
    });

    this.currentVirtualDate = new Date();
    const hour = this.currentVirtualDate.getHours();
    const loadMultiplier = this.getPassengerLoadMultiplier(hour);
    const solarMultiplier = this.getSolarIntensityMultiplier(hour);

    sensors.forEach((s) => {
      this.sensorStates.set(s.id, {
        type: s.type as SensorType,
        value:
          s.currentValue ||
          this.calculateBaseline(s.type as SensorType, loadMultiplier, solarMultiplier),
      });
    });

    const activeRunway = this.getActiveRunway();

    const activeGroundFlights = await prisma.flight.findMany({
      where: { status: { in: ['LANDED', 'TAXIING', 'PARKED', 'PUSHBACK'] } },
      include: { parkingStand: true },
    });

    activeGroundFlights.forEach((f: any) => {
      const isAtGate = f.status === 'PARKED' || f.status === 'PUSHBACK';
      const assignedTerminal = this.getTerminalForFlight(f);
      const routePaths = LONG_THANH_COORDS.ROUTES[assignedTerminal];

      if (!routePaths) return;

      const isArrival = f.status === 'LANDED' || (f.status === 'TAXIING' && !isAtGate);
      const activeRoute = isArrival ? routePaths.inbound : routePaths.outbound;
      const destType: 'TERMINAL' | 'RUNWAY' = isArrival ? 'TERMINAL' : 'RUNWAY';

      if (!activeRoute || activeRoute.length === 0) return;

      const firstPoint = activeRoute[0];
      const lastPoint = activeRoute[activeRoute.length - 1];

      if (!firstPoint || !lastPoint) return;

      const gateLat = f.parkingStand?.y ?? lastPoint.lat;
      const gateLng = f.parkingStand?.x ?? lastPoint.lng;

      const startPoint = isAtGate ? { lat: gateLat, lng: gateLng } : firstPoint;

      let assignedSpeed = 0;
      let assignedRouteArray: { lat: number; lng: number }[] = [];
      let waypointIndex = 0;
      let activeLock: string | undefined = undefined;

      if (f.status === 'TAXIING' || f.status === 'LANDED' || f.status === 'PUSHBACK') {
        const requiredLock = isArrival ? 'INBOUND' : 'OUTBOUND';
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

      const flightDirection = f.direction as 'INBOUND' | 'OUTBOUND' | 'TURNAROUND';

      this.flightStates.set(f.id, {
        id: f.id,
        flightNumber: f.flightNumber,
        status: f.status as FlightStatus,
        direction: flightDirection || (isArrival ? 'INBOUND' : 'OUTBOUND'), // ✅ Track direction
        assignedRunway: activeRunway,
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
        terminal: assignedTerminal,
        gateLat,
        gateLng,
      });
    });

    this.isRunning = true;
    this.intervalId = setInterval(() => this.tick(), this.TICK_RATE_MS);
    return { message: 'Simulation engine started.' };
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

      const telemetryLogsToInsert: any[] = [];

      // 1. Create a batch array outside the loop
      const telemetryBatch = [];

      for (const flight of this.flightStates.values()) {
        flight.ticksInState++;
        this.evaluateFlightStateTransition(flight);
        this.calculateNextFlightPosition(flight);

        // 2. Push to batch instead of emitting directly
        telemetryBatch.push({
          id: flight.id,
          sts: flight.status,
          dir: flight.direction,
          lat: Number(flight.lat.toFixed(6)),
          lng: Number(flight.lng.toFixed(6)),
          alt: Number(flight.alt.toFixed(0)),
          spd: Number(flight.speed.toFixed(1)),
          hdg: Number(flight.heading.toFixed(0)),
        });

        /* DB logging logic remains here... */
      }

      // 3. Emit ONCE per tick
      if (telemetryBatch.length > 0) {
        io.emit('flights:telemetry:batch', telemetryBatch);
      }

      if (this.currentTick % 10 === 0) {
        await this.manageATCAndPipeline();
      }

      if (isDbSaveTick) {
        await prisma.$transaction([
          ...dbUpdates,
          prisma.sensorLog.createMany({ data: logsToInsert }),
          prisma.flightTelemetry.createMany({ data: telemetryLogsToInsert }),
        ]);

        const oneHourAgo = new Date(this.currentVirtualDate.getTime() - 60 * 60 * 1000);
        await prisma.flightTelemetry.deleteMany({ where: { timestamp: { lt: oneHourAgo } } });
        await prisma.sensorLog.deleteMany({ where: { timestamp: { lt: oneHourAgo } } });
      }
    } catch (error) {
      console.error('[Simulation Engine] Critical Tick Error:', error);
    }
  }

  private async manageATCAndPipeline() {
    const activeRunway = this.getActiveRunway();

    const approachingCount = await prisma.flight.count({ where: { status: 'APPROACHING' } });
    let parkedCount = 0;
    this.flightStates.forEach((f) => {
      if (f.status === 'PARKED' || f.status === 'PUSHBACK') parkedCount++;
    });

    // 1. MAINTAIN THE ECOSYSTEM BALANCE
    if (approachingCount + parkedCount < 10) {
      const recycledFlight = await prisma.flight.findFirst({
        where: { status: { notIn: ['LANDED', 'TAXIING', 'PARKED', 'PUSHBACK', 'APPROACHING'] } },
      });

      if (recycledFlight && !this.flightStates.has(recycledFlight.id)) {
        const activeFlights = await prisma.flight.findMany({
          where: { status: { in: ['APPROACHING', 'LANDED', 'TAXIING', 'PARKED', 'PUSHBACK'] } },
        });
        const usedStands = new Set(activeFlights.map((f) => f.parkingStandId).filter(Boolean));
        const allStands = await prisma.parkingStand.findMany();
        const freeStands = allStands.filter((s) => !usedStands.has(s.id));

        if (freeStands.length > 0) {
          const newStand = freeStands[Math.floor(Math.random() * freeStands.length)];
          if (!newStand) return;

          let terminal: 'T1' | 'T2' | 'T3' = 'T1';
          if (newStand.code.includes('T2')) terminal = 'T2';
          if (newStand.code.includes('T3')) terminal = 'T3';

          if (parkedCount < 6) {
            const routePaths = LONG_THANH_COORDS.ROUTES[terminal];
            // End of the inbound route acts as the spawn/gate spot
            const gateSpot = routePaths.inbound[routePaths.inbound.length - 1];

            if (gateSpot) {
              this.flightStates.set(recycledFlight.id, {
                id: recycledFlight.id,
                flightNumber: recycledFlight.flightNumber,
                status: 'PARKED',
                direction: 'TURNAROUND', // ✅ Assign Direction
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
                terminal: terminal,
                gateLat: newStand.y,
                gateLng: newStand.x,
              });

              await prisma.flight.update({
                where: { id: recycledFlight.id },
                data: { status: 'PARKED', direction: 'TURNAROUND', parkingStandId: newStand.id },
              });
              console.log(
                `[ATC] 🏗️ Spawned ${recycledFlight.flightNumber} at ${newStand.code} (PARKED).`
              );
            }
          } else {
            await prisma.flight.update({
              where: { id: recycledFlight.id },
              data: { status: 'APPROACHING', direction: 'INBOUND', parkingStandId: newStand.id },
            });
            console.log(
              `[ATC] ☁️ Spawned ${recycledFlight.flightNumber} in sky (APPROACHING for ${newStand.code}).`
            );
          }
        }
      }
    }

    // 2. ATC CLEARANCE INBOUND - Assigns exact inbound route based on reserved terminal
    if (!this.reservedRoutes.has('INBOUND')) {
      const approachingFlight = await prisma.flight.findFirst({
        where: { status: 'APPROACHING' },
        include: { parkingStand: true },
      });

      if (approachingFlight && !this.flightStates.has(approachingFlight.id)) {
        this.reservedRoutes.add('INBOUND');

        const terminal = this.getTerminalForFlight(approachingFlight);
        const route = LONG_THANH_COORDS.ROUTES[terminal].inbound;
        const landingSpot = route[0];

        if (landingSpot) {
          this.flightStates.set(approachingFlight.id, {
            id: approachingFlight.id,
            flightNumber: approachingFlight.flightNumber,
            status: 'LANDED',
            direction: 'INBOUND',
            assignedRunway: activeRunway,
            lat: landingSpot.lat,
            lng: landingSpot.lng,
            alt: 50,
            speed: 55,
            heading: 0,
            ticksInState: 0,
            route: route,
            currentWaypointIndex: 1,
            destinationType: 'TERMINAL',
            activeRouteId: 'INBOUND',
            terminal: terminal,
            gateLat: approachingFlight.parkingStand?.y || 0,
            gateLng: approachingFlight.parkingStand?.x || 0,
          });

          await prisma.flight.update({
            where: { id: approachingFlight.id },
            data: { status: 'LANDED', direction: 'INBOUND', assignedRunway: activeRunway },
          });
          console.log(
            `[ATC] 🛬 ${approachingFlight.flightNumber} cleared to land to ${terminal}. INBOUND locked.`
          );
        }
      }
    }
  }

  private evaluateFlightStateTransition(flight: FlightSimState) {
    if (flight.status === 'LANDED' && flight.ticksInState > 2) {
      flight.direction = 'INBOUND'; // Keep inbound direction
      this.changeFlightStatus(flight, 'TAXIING', 20);
      console.log(
        `[ATC] 🚕 ${flight.flightNumber} slowing down, TAXIING inbound to ${flight.terminal}.`
      );
    }

    if (flight.status === 'TAXIING' && flight.destinationType === 'TERMINAL') {
      if (flight.currentWaypointIndex >= flight.route.length) {
        flight.direction = 'TURNAROUND';
        this.changeFlightStatus(flight, 'PARKED', 0);

        flight.lat = flight.gateLat;
        flight.lng = flight.gateLng;

        if (flight.activeRouteId === 'INBOUND') {
          this.reservedRoutes.delete('INBOUND');
          flight.activeRouteId = undefined;
          console.log(`[ATC] 🛑 ${flight.flightNumber} PARKED. INBOUND track is clear.`);
        }
      }
    }

    const turnaroundThreshold = 25 + Math.random() * 15;

    if (flight.status === 'PARKED' && flight.ticksInState > turnaroundThreshold) {
      if (!this.reservedRoutes.has('OUTBOUND')) {
        this.reservedRoutes.add('OUTBOUND');

        flight.direction = 'OUTBOUND';
        this.changeFlightStatus(flight, 'PUSHBACK', 0);
        flight.activeRouteId = 'OUTBOUND';

        console.log(
          `[ATC] 🚜 ${flight.flightNumber} turnaround complete. Cleared for PUSHBACK from ${flight.terminal}.`
        );
      }
    }

    if (flight.status === 'PUSHBACK' && flight.ticksInState > 3) {
      flight.direction = 'OUTBOUND';
      this.changeFlightStatus(flight, 'TAXIING', 20);
      flight.destinationType = 'RUNWAY';
      flight.route = LONG_THANH_COORDS.ROUTES[flight.terminal].outbound;
      flight.currentWaypointIndex = 1;

      console.log(
        `[ATC] 🛫 ${flight.flightNumber} pushback complete. Cleared to taxi from ${flight.terminal}.`
      );
    }

    if (flight.status === 'TAXIING' && flight.destinationType === 'RUNWAY') {
      if (flight.currentWaypointIndex >= flight.route.length) {
        if (flight.activeRouteId === 'OUTBOUND') {
          this.reservedRoutes.delete('OUTBOUND');
          flight.activeRouteId = undefined;
        }

        this.flightService.updateStatus(flight.id, { status: 'DEPARTED' }).catch(console.error);
        this.flightStates.delete(flight.id);
        console.log(`[ATC] ✈️ ${flight.flightNumber} DEPARTED. OUTBOUND track is clear.`);
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

    // If the distance to the target is less than the distance the plane will travel
    // in the next tick (plus a tiny buffer), snap it to the target.
    if (distToTarget <= distancePerTick * 1.5) {
      flight.lat = target.lat;
      flight.lng = target.lng;
      flight.currentWaypointIndex++;
    }
  }

  private changeFlightStatus(flight: FlightSimState, newStatus: FlightStatus, speed: number) {
    flight.status = newStatus;
    flight.speed = speed;
    flight.ticksInState = 0;
    // The flight.service handles propagating the new 'direction' to the DB based on the newStatus!
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

  // Add this helper method inside your SimulationService class
  private getActiveRunway(): string {
    // Phase 2 TODO: Fetch WIND_OUTDOOR sensor heading.
    // If heading > 90 && < 270, return 'RWY_05L', else return 'RWY_23R'.
    // Requires plotting reverse taxi waypoints in LONG_THANH_COORDS.
    return 'RWY_05L';
  }
}
