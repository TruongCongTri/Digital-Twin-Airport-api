import { prisma } from '@/common/configs/prisma';
import { FlightStatus, SensorType } from '@/generated/client';
import { socketConfig } from '@/common/configs/socket';
import { FlightService } from '../flight/flight.service';

export type ScenarioType =
  | 'NONE'
  | 'TROPICAL_SQUALL'
  | 'TARMAC_OVERHEAT'
  | 'AC_FAILURE'
  | 'HEAVY_LOAD'
  | 'EARTHQUAKE';

// Type definition for our in-memory flight tracker
interface FlightSimState {
  id: string;
  flightNumber: string;
  status: FlightStatus;
  assignedRunway: string | null;
  lat: number;
  lng: number;
  alt: number;
  speed: number; // knots
  heading: number; // degrees
  ticksInState: number; // Tracks how long a plane has been in its current status
}

export class SimulationService {
  // 1. Singleton Instance setup
  private static instance: SimulationService;

  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private currentTick = 0;
  private readonly TICK_RATE_MS = 3000;
  private readonly DB_SAVE_TICK_MODULO = 20;

  // Sensor State
  private sensorStates: Map<string, { value: number; type: SensorType }> = new Map();

  // Flight State
  private flightStates: Map<string, FlightSimState> = new Map();
  private readonly flightService: FlightService;

  // --- ENVIRONMENT STATE ---
  private currentVirtualDate: Date = new Date();
  private activeScenario: ScenarioType = 'NONE';
  private scenarioTicksRemaining = 0;

  // Long Thanh Airport Coordinates (Approximate Center/Runway)
  private readonly RUNWAY_START_LAT = 10.772611;
  private readonly RUNWAY_START_LNG = 107.04528;
  private readonly TERMINAL_GATE_LAT = 10.7745; // Slightly North-East of Runway
  private readonly TERMINAL_GATE_LNG = 107.047;

  // Make constructor private for Singleton pattern
  private constructor() {
    this.flightService = new FlightService();
  }

  public static getInstance(): SimulationService {
    if (!SimulationService.instance) {
      SimulationService.instance = new SimulationService();
    }
    return SimulationService.instance;
  }

  /**
   * @description Starts the mock data engine
   */
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

    const currentWindHeading = 60;
    const activeRunway = currentWindHeading > 0 && currentWindHeading < 180 ? 'RWY_05L' : 'RWY_23R';

    const activeGroundFlights = await prisma.flight.findMany({
      where: { status: { in: ['LANDED', 'TAXIING', 'PARKED', 'PUSHBACK'] } },
    });

    activeGroundFlights.forEach((f) => {
      const isAtGate = f.status === 'PARKED' || f.status === 'PUSHBACK';
      this.flightStates.set(f.id, {
        id: f.id,
        flightNumber: f.flightNumber,
        status: f.status,
        assignedRunway: activeRunway,
        lat: isAtGate ? this.TERMINAL_GATE_LAT : this.RUNWAY_START_LAT,
        lng: isAtGate ? this.TERMINAL_GATE_LNG : this.RUNWAY_START_LNG,
        alt: 0,
        speed: f.status === 'PARKED' ? 0 : 15,
        heading: isAtGate ? 225 : 45,
        ticksInState: 0,
      });

      prisma.flight
        .update({
          where: { id: f.id },
          data: { assignedRunway: activeRunway },
        })
        .catch(console.error);
    });

    this.isRunning = true;
    this.intervalId = setInterval(() => this.tick(), this.TICK_RATE_MS);
    return { message: 'Simulation engine started with Sensor, AI, & Aviation telemetry.' };
  }

  public stop(): { message: string } {
    if (!this.isRunning) return { message: 'Simulation engine is not running.' };

    if (this.intervalId) clearInterval(this.intervalId);
    this.isRunning = false;
    this.activeScenario = 'NONE';
    return { message: 'Simulation engine stopped.' };
  }

  /**
   * @description The core loop executed every 3 seconds
   */
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

      // 1. GENERATE AI PREDICTIONS
      if (this.currentTick % 5 === 0) {
        this.simulateAIPredictions(io);
      }

      // 2. PROCESS SENSORS
      const dbUpdates = [];
      const logsToInsert = [];

      for (const [id, state] of this.sensorStates.entries()) {
        state.value = this.calculateNextValue(
          state.value,
          state.type,
          loadMultiplier,
          solarMultiplier
        );

        io.emit('sensor:stream', {
          sensorId: id,
          type: state.type,
          value: state.value,
          timestamp: this.currentVirtualDate.toISOString(),
        });

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

      // 3. PROCESS FLIGHTS
      const telemetryLogsToInsert: any[] = [];

      for (const flight of this.flightStates.values()) {
        flight.ticksInState++;
        this.calculateNextFlightPosition(flight);

        io.emit('flight:telemetry', {
          flightId: flight.id,
          flightNumber: flight.flightNumber,
          status: flight.status,
          assignedRunway: flight.assignedRunway,
          lat: flight.lat,
          lng: flight.lng,
          alt: flight.alt,
          speed: flight.speed,
          heading: flight.heading,
          timestamp: this.currentVirtualDate.toISOString(),
        });

        if (isDbSaveTick) {
          telemetryLogsToInsert.push({
            flightId: flight.id,
            latitude: flight.lat,
            longitude: flight.lng,
            altitude: flight.alt,
            speed: flight.speed,
            heading: flight.heading,
            timestamp: this.currentVirtualDate,
          });
        }

        this.evaluateFlightStateTransition(flight);
      }

      // 4. DATABASE BATCH EXECUTION
      if (isDbSaveTick) {
        await this.injectArrivals();

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

  // TASK 1: ADVANCED TIME-SERIES AI PREDICTION SIMULATION
  private simulateAIPredictions(io: any) {
    // Defined forecast horizons in hours (Quarter = ~2190h, Season = ~4380h)
    const forecastHorizons = [6, 12, 18, 24, 2190, 4380];

    for (const [id, state] of this.sensorStates.entries()) {
      const predictions = forecastHorizons.map((horizonHours) => {
        // 1. Determine Future Time Context
        const futureDate = new Date(
          this.currentVirtualDate.getTime() + horizonHours * 60 * 60 * 1000
        );
        const futureHour = futureDate.getHours();

        // 2. Calculate Base Future Reality (What normally happens at this hour?)
        const futureLoad = this.getPassengerLoadMultiplier(futureHour);
        const futureSolar = this.getSolarIntensityMultiplier(futureHour);
        let predictedVal = this.calculateBaseline(state.type, futureLoad, futureSolar);

        // 3. Apply "Scenario Decay" Logic
        // The AI assumes current anomalies will resolve over time.
        // 60% impact at 6h, 30% at 12h, 10% at 24h, 0% for next Quarter/Season.
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

        // 4. Add AI Variance/Noise (10% fluctuation)
        predictedVal += (Math.random() - 0.5) * (predictedVal * 0.1);

        // 5. Calculate Confidence Score (Decays as we look further into the future)
        // 6h = ~94%, 24h = ~85%, Quarter = ~70%, Season = ~45%
        const baseConfidence = Math.max(0.4, 0.95 - (horizonHours / 4380) * 0.5);
        const confidenceScore = Number(
          (baseConfidence + (Math.random() * 0.05 - 0.025)).toFixed(2)
        );

        // 6. Format Number based on Sensor Type
        const finalVal =
          state.type === 'TILT_STRUCTURAL'
            ? Number(predictedVal.toFixed(4))
            : state.type === 'LIGHT_DENSITY' ||
                state.type === 'CO2' ||
                state.type === 'CAMERA_AI_CROWD'
              ? Number(predictedVal.toFixed(0))
              : Number(predictedVal.toFixed(2));

        // Map hour numbers to UI friendly labels
        let horizonLabel = `${horizonHours}H`;
        if (horizonHours === 2190) horizonLabel = 'NEXT QTR';
        if (horizonHours === 4380) horizonLabel = 'NEXT SEASON';

        return {
          timestamp: futureDate.toISOString(),
          horizonLabel,
          predictedValue: Math.max(0, finalVal), // Prevent negative predictions
          confidenceScore,
        };
      });

      // Emit the full time-series array for this specific sensor
      io.emit('ai:prediction:stream', {
        sensorId: id,
        type: state.type,
        predictions,
      });
    }
  }

  // TASK 2 & 3: SCENARIO TRIGGERING, SWITCHING, AND STOPPING
  public triggerScenario(scenario: ScenarioType): { message: string } {
    if (!this.isRunning) return { message: 'Simulation must be running to trigger scenarios.' };

    // Stop scenario gracefully
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
        this.scenarioTicksRemaining = 30; // Short bursts
        break;

      case 'HEAVY_LOAD':
        this.scenarioTicksRemaining = 300; // Extended duration
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

  // TASK 3: APPLY SCENARIO IMPACTS TO SENSORS
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
      if (type === 'TILT_STRUCTURAL') target += 0.015; // Floor stress from crowd mass
    }

    if (this.activeScenario === 'EARTHQUAKE') {
      if (type === 'TILT_STRUCTURAL') return current + Math.random() * 0.08; // Violent shaking
      if (type === 'WIND_INDOOR') target += 2.0; // Air displacement
      if (type === 'CAMERA_AI_CROWD') target = Math.max(0, target - 200); // Evacuation panic
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

  // TASK 4: CONTINUOUS FLIGHT LIFECYCLE (Movement & Routing)
  private calculateNextFlightPosition(flight: FlightSimState) {
    if (flight.speed === 0 || flight.status === 'PARKED') return;

    const headingRad = flight.heading * (Math.PI / 180);
    const distancePerTick = flight.speed * 0.000008;

    flight.lat += Math.cos(headingRad) * distancePerTick;
    flight.lng += Math.sin(headingRad) * distancePerTick;
  }

  private evaluateFlightStateTransition(flight: FlightSimState) {
    const distToTerminal =
      Math.abs(flight.lat - this.TERMINAL_GATE_LAT) + Math.abs(flight.lng - this.TERMINAL_GATE_LNG);
    const distToRunway =
      Math.abs(flight.lat - this.RUNWAY_START_LAT) + Math.abs(flight.lng - this.RUNWAY_START_LNG);

    // 1. Landed -> Taxiing to Gate
    if (flight.status === 'LANDED') {
      this.changeFlightStatus(flight, 'TAXIING', 15);
      flight.heading = this.calculateHeading(
        flight.lat,
        flight.lng,
        this.TERMINAL_GATE_LAT,
        this.TERMINAL_GATE_LNG
      );
    }

    // 2. Taxiing -> Parked at Gate
    if (
      flight.status === 'TAXIING' &&
      distToTerminal < 0.0005 &&
      flight.heading < 360 /* Approaching Terminal */
    ) {
      this.changeFlightStatus(flight, 'PARKED', 0);
      console.log(`🛑 Flight ${flight.flightNumber} has PARKED at the terminal.`);
    }

    // 3. Parked -> Pushback (Automatically leave after ~45 seconds for demo loop)
    if (flight.status === 'PARKED' && flight.ticksInState > 15) {
      this.changeFlightStatus(flight, 'PUSHBACK', 0);
    }

    // 4. Pushback -> Taxiing to Runway
    if (flight.status === 'PUSHBACK' && flight.ticksInState > 3) {
      this.changeFlightStatus(flight, 'TAXIING', 15);
      flight.heading = this.calculateHeading(
        flight.lat,
        flight.lng,
        this.RUNWAY_START_LAT,
        this.RUNWAY_START_LNG
      );
      console.log(`🛫 Flight ${flight.flightNumber} is TAXIING to runway.`);
    }

    // 5. Taxiing -> Departed (Leaves airport surface)
    if (flight.status === 'TAXIING' && distToRunway < 0.0005 && flight.ticksInState > 10) {
      this.flightService.updateStatus(flight.id, { status: 'DEPARTED' }).catch(console.error);
      this.flightStates.delete(flight.id);
      console.log(`✈️ Flight ${flight.flightNumber} has DEPARTED and exited Surface Monitoring.`);
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

  private async injectArrivals() {
    if (this.flightStates.size >= 5) return;

    let approachingFlight = await prisma.flight.findFirst({ where: { status: 'APPROACHING' } });

    // Infinite Recycler: Pull departed flights back in as approaching
    if (!approachingFlight) {
      const recycledFlight = await prisma.flight.findFirst({
        where: { status: { in: ['DEPARTED', 'CANCELLED'] } },
      });
      if (recycledFlight) {
        approachingFlight = await prisma.flight.update({
          where: { id: recycledFlight.id },
          data: { status: 'APPROACHING' },
        });
      }
    }

    if (approachingFlight) {
      const activeRunway = 'RWY_05L';
      this.flightStates.set(approachingFlight.id, {
        id: approachingFlight.id,
        flightNumber: approachingFlight.flightNumber,
        status: 'LANDED',
        assignedRunway: activeRunway,
        lat: this.RUNWAY_START_LAT,
        lng: this.RUNWAY_START_LNG,
        alt: 0,
        speed: 15,
        heading: this.calculateHeading(
          this.RUNWAY_START_LAT,
          this.RUNWAY_START_LNG,
          this.TERMINAL_GATE_LAT,
          this.TERMINAL_GATE_LNG
        ),
        ticksInState: 0,
      });

      await this.flightService.updateStatus(approachingFlight.id, { status: 'LANDED' });
      await prisma.flight.update({
        where: { id: approachingFlight.id },
        data: { assignedRunway: activeRunway },
      });
    }
  }
}
