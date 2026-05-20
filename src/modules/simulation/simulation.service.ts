import { prisma } from '@/common/configs/prisma';
import { FlightStatus, SensorType } from '@/generated/client';
import { socketConfig } from '@/common/configs/socket';
import { FlightService } from '../flight/flight.service';

// Type definition for our in-memory flight tracker
interface FlightSimState {
  id: string;
  flightNumber: string;
  status: FlightStatus;
  lat: number;
  lng: number;
  alt: number;
  speed: number; // knots
  heading: number; // degrees
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
  private currentVirtualDate: Date = new Date(); // Allows us to manipulate time later
  private activeWeatherEvent: 'NONE' | 'TROPICAL_SQUALL' = 'NONE';
  private weatherEventTicksRemaining = 0;

  // Long Thanh Airport Coordinates (Approximate Center/Runway)
  private readonly LT_LAT = 10.7611;
  private readonly LT_LNG = 106.9633;

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

    // 1. Load baseline sensors into memory
    const sensors = await prisma.sensor.findMany({
      select: { id: true, type: true, currentValue: true },
    });

    // Reset to realistic baselines based on CURRENT time of day
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

    // Initialize Active Flights
    const activeFlights = await prisma.flight.findMany({
      where: { status: { in: ['APPROACHING', 'TAXIING'] } },
    });

    activeFlights.forEach((f) => {
      // Mock starting coordinates based on status
      const isApproaching = f.status === 'APPROACHING';
      this.flightStates.set(f.id, {
        id: f.id,
        flightNumber: f.flightNumber,
        status: f.status,
        // If approaching, start them slightly away from the airport in the sky. If taxiing, start on the ground.
        lat: isApproaching ? this.LT_LAT - 0.15 : this.LT_LAT,
        lng: isApproaching ? this.LT_LNG - 0.15 : this.LT_LNG,
        alt: isApproaching ? 15000 : 0,
        speed: isApproaching ? 250 : 20,
        heading: 45, // Approaching runway 05
      });
    });

    this.isRunning = true;

    // 2. Start the heartbeat loop
    this.intervalId = setInterval(() => this.tick(), this.TICK_RATE_MS);
    return { message: 'Simulation engine started with Sensor & Aviation telemetry.' };
  }

  public stop(): { message: string } {
    if (!this.isRunning) return { message: 'Simulation engine is not running.' };

    if (this.intervalId) clearInterval(this.intervalId);
    this.isRunning = false;
    return { message: 'Simulation engine stopped.' };
  }

  /**
   * @description The core loop executed every 3 seconds
   */
  private async tick() {
    this.currentTick++;
    const isDbSaveTick = this.currentTick % this.DB_SAVE_TICK_MODULO === 0;
    const io = socketConfig.getIO();

    // 1. Update Environment Time & Weather
    // Advance virtual time by 3 seconds per tick (or faster if you want to speed up a demo)
    this.currentVirtualDate.setSeconds(this.currentVirtualDate.getSeconds() + 3);
    this.processWeatherEvents();

    const hour = this.currentVirtualDate.getHours();
    const loadMultiplier = this.getPassengerLoadMultiplier(hour);
    const solarMultiplier = this.getSolarIntensityMultiplier(hour);

    // PROCESS SENSORS
    const dbUpdates = [];
    const logsToInsert = [];

    for (const [id, state] of this.sensorStates.entries()) {
      // 1. Calculate realistic fluctuation (Random Walk)
      state.value = this.calculateNextValue(
        state.value,
        state.type,
        loadMultiplier,
        solarMultiplier
      );

      // 2. Broadcast to UI instantly (WebSockets)
      io.emit('sensor:stream', {
        sensorId: id,
        type: state.type,
        value: state.value,
        timestamp: this.currentVirtualDate.toISOString(),
      });

      // 3. Prepare Database saves (only every 1 minute)
      if (isDbSaveTick) {
        // update fast cache on Sensor Table
        dbUpdates.push(
          prisma.sensor.update({
            where: { id },
            data: { currentValue: state.value, lastReadAt: this.currentVirtualDate },
          })
        );
        logsToInsert.push({ sensorId: id, value: state.value, timestamp: this.currentVirtualDate });
      }
    }

    // PROCESS FLIGHTS
    const telemetryLogsToInsert: any[] = [];

    for (const flight of this.flightStates.values()) {
      // Calculate new GPS position
      this.calculateNextFlightPosition(flight);

      // Broadcast live movement to the 3D map every 3 seconds (Zero DB hit)
      io.emit('flight:telemetry', {
        flightId: flight.id,
        flightNumber: flight.flightNumber,
        status: flight.status,
        lat: flight.lat,
        lng: flight.lng,
        alt: flight.alt,
        speed: flight.speed,
        heading: flight.heading,
        timestamp: this.currentVirtualDate.toISOString(),
      });

      // Save to database only on the modulo tick to save performance
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

      // Automatically transition states (e.g., Approaching -> Landed)
      this.evaluateFlightStateTransition(flight);
    }

    // 4. Execute DB transactions in a batch to save connection pool
    if (isDbSaveTick) {
      try {
        await prisma.$transaction([
          ...dbUpdates,
          prisma.sensorLog.createMany({ data: logsToInsert }),
          prisma.flightTelemetry.createMany({ data: telemetryLogsToInsert }),
        ]);

        const oneHourAgo = new Date(this.currentVirtualDate.getTime() - 60 * 60 * 1000);
        await prisma.flightTelemetry.deleteMany({
          where: { timestamp: { lt: oneHourAgo } },
        });
        await prisma.sensorLog.deleteMany({
          where: { timestamp: { lt: oneHourAgo } },
        });

        console.log(`[Simulation Engine] Saved batch. Pruned old data.`);
      } catch (error) {
        console.error('Simulation engine DB Save Failed:', error);
      }
    }
  }

  /**
   * @description Manually trigger a demo scenario to instantly override baselines
   */
  public triggerScenario(scenario: string): { message: string } {
    if (!this.isRunning) {
      return { message: 'Simulation must be running to trigger scenarios.' };
    }

    switch (scenario) {
      case 'TROPICAL_SQUALL':
        this.activeWeatherEvent = 'TROPICAL_SQUALL';
        this.weatherEventTicksRemaining = 200;

        // FLIGHT IMPACT: Force all approaching planes to veer off and hold
        for (const flight of this.flightStates.values()) {
          if (flight.status === 'APPROACHING') {
            flight.heading = (flight.heading + 90) % 360; // Turn 90 degrees away from airport
            flight.speed = 220; // Maintain holding speed
            console.log(
              `⚠️ ATC WARNING: Flight ${flight.flightNumber} diverted to holding pattern due to squall.`
            );
          }
        }
        break;

      case 'TARMAC_OVERHEAT':
        for (const state of this.sensorStates.values()) {
          if (state.type === 'TARMAC_TEMP') state.value = 65.5;
        }
        break;

      case 'AC_FAILURE':
        for (const state of this.sensorStates.values()) {
          if (state.type === 'TEMPERATURE') state.value = 28.0;
          if (state.type === 'CO2') state.value = 1500;
          if (state.type === 'HUMIDITY') state.value = 75.0;
        }
        break;
    }

    // Force an immediate tick to broadcast the sudden spike via WebSockets
    this.tick();

    return { message: `Scenario [${scenario}] triggered successfully.` };
  }

  // ==========================================
  // MATHEMATICAL MODELS FOR LONG THANH AIRPORT
  // ==========================================

  /**
   * @description Determines if a sudden tropical storm hits (Dong Nai specific)
   */
  private processWeatherEvents() {
    if (this.activeWeatherEvent === 'NONE') {
      // 0.05% chance per 3 seconds to spawn a squall (~1 storm every few hours)
      // Only likely in afternoon (hours 13 to 18)
      const hour = this.currentVirtualDate.getHours();
      if (hour >= 13 && hour <= 18 && Math.random() < 0.0005) {
        this.activeWeatherEvent = 'TROPICAL_SQUALL';
        this.weatherEventTicksRemaining = 600; // Lasts for ~30 minutes (600 ticks * 3s)
        console.log(`[WEATHER] 🌩️ Tropical Squall detected at Long Thanh!`);
      }
    } else {
      this.weatherEventTicksRemaining--;
      if (this.weatherEventTicksRemaining <= 0) {
        this.activeWeatherEvent = 'NONE';
        console.log(`[WEATHER] 🌤️ Tropical Squall has passed.`);
      }
    }
  }

  /**
   * @description Simulates SEA international flight schedules
   * Returns a multiplier between 0.2 (empty) and 1.0 (packed)
   */
  private getPassengerLoadMultiplier(hour: number): number {
    // Peak 1: 06:00 - 10:00
    if (hour >= 6 && hour <= 10) return 0.8 + Math.random() * 0.2;
    // Peak 2: 20:00 - 23:00
    if (hour >= 20 && hour <= 23) return 0.9 + Math.random() * 0.1;
    // Dead of night: 01:00 - 04:00
    if (hour >= 1 && hour <= 4) return 0.1 + Math.random() * 0.1;
    // Normal daytime
    return 0.4 + Math.random() * 0.2;
  }

  /**
   * @description Simulates Tropical Solar Curve for Dong Nai
   * Returns 0 at night, up to 1.0 at 14:00 (2 PM)
   */
  private getSolarIntensityMultiplier(hour: number): number {
    if (hour < 6 || hour > 18) return 0; // Night
    // Sine wave peaking at hour 14 (2 PM)
    // Map hour 6->18 to 0->PI
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
        // Calculates baseline people count in a zone (max 500 people per camera zone)
        return Math.floor(load * 500);

      case 'LIGHT_DENSITY': {
        // 1. Calculate Natural Sunlight (Lux) entering the building
        const naturalLight = solar * 900;

        // 2. Smart LED System (Target: Maintain at least 450 Lux)
        let artificialLight = 0;
        if (naturalLight < 450) {
          artificialLight = 450 - naturalLight;
        }

        // The sensor reads the total combined light
        return naturalLight + artificialLight;
      }

      case 'TILT_STRUCTURAL':
        return solar * 0.004;

      default:
        return 0;
    }
  }

  /**
   * @description Calculates the next tick value using target-seeking random walks
   */
  private calculateNextValue(
    current: number,
    type: SensorType,
    load: number,
    solar: number
  ): number {
    let target = this.calculateBaseline(type, load, solar);

    // --- APPLY SUDDEN WEATHER / EVENT OVERRIDES ---
    if (this.activeWeatherEvent === 'TROPICAL_SQUALL') {
      if (type === 'WIND_OUTDOOR') target = 22.0;
      if (type === 'TARMAC_TEMP') target = Math.max(28.0, target - 15.0);
      if (type === 'HUMIDITY') target = 85.0;
      if (type === 'WIND_INDOOR') target = 0.8; // Drafts blowing into the terminal
      if (type === 'LIGHT_DENSITY') {
        // Squall blocks the sun (solar drops), Smart LEDs instantly turn on to 450 Lux
        target = 450.0;
      }
      if (type === 'TILT_STRUCTURAL') {
        // Violent winds cause the building envelope to flex slightly
        target = 0.015;
      }
      if (type === 'CAMERA_AI_CROWD') {
        // Flights are delayed, causing passengers to pile up in terminal zones
        target = Math.floor(target * 1.4);
      }
    }

    // --- ADD MICRO-SHOCKS (VIBRATIONS) ---
    // Simulate a heavy aircraft landing/taxiing nearby (1% chance per tick)
    if (type === 'TILT_STRUCTURAL' && Math.random() < 0.01) {
      return current + 0.008; // Sudden momentary spike in tilt
    }

    // --- SMOOTH MOVEMENT TOWARDS TARGET ---
    const difference = target - current;

    // Light travels instantly, so light sensors update immediately.
    // Temperature/CO2 change slowly.
    const stepMultiplier = type === 'LIGHT_DENSITY' ? 0.8 : 0.05;
    const step = difference * stepMultiplier;

    // Add micro-fluctuations (noise)
    let noiseLimit = 0.1;
    if (type === 'CO2') noiseLimit = 3.0;
    if (type === 'LIGHT_DENSITY') noiseLimit = 5.0; // Minor flickering or shadows
    if (type === 'TILT_STRUCTURAL') noiseLimit = 0.0005; // Sensor noise
    if (type === 'WIND_INDOOR') noiseLimit = 0.05;
    if (type === 'CAMERA_AI_CROWD') noiseLimit = 15.0; // People moving in and out of frame

    const noise = (Math.random() - 0.5) * noiseLimit;

    // Format safely to prevent negative values
    const nextValue = Math.max(0, current + step + noise);

    // Format decimal places based on sensor precision requirements
    if (type === 'TILT_STRUCTURAL') return Number(nextValue.toFixed(4));
    if (type === 'LIGHT_DENSITY' || type === 'CO2' || type === 'CAMERA_AI_CROWD')
      return Number(nextValue.toFixed(0));

    return Number(nextValue.toFixed(2));
  }

  // ==========================================
  // AVIATION MATHEMATICAL MODELS
  // ==========================================

  /**
   * @description Uses simple vector math to move the plane based on speed and heading
   */
  // private calculateNextFlightPosition(flight: FlightSimState) {
  //   // Weather Impact: Tropical Squalls force planes to slow down and descend slower
  //   let currentSpeed = flight.speed;
  //   if (this.activeWeatherEvent === 'TROPICAL_SQUALL' && flight.status === 'APPROACHING') {
  //     currentSpeed = currentSpeed * 0.8; // 20% speed reduction due to bad weather
  //   }

  //   // Convert heading to radians
  //   const headingRad = flight.heading * (Math.PI / 180);

  //   // Very simplified lat/lng translation per 3-second tick
  //   // (In reality, 1 degree of lat is ~111km. We use a micro-multiplier for the demo scale)
  //   const distancePerTick = (currentSpeed * 0.000001);

  //   flight.lat += Math.cos(headingRad) * distancePerTick;
  //   flight.lng += Math.sin(headingRad) * distancePerTick;

  //   // Altitude logic
  //   if (flight.status === 'APPROACHING') {
  //     // Descend towards 0
  //     flight.alt = Math.max(0, flight.alt - (flight.alt * 0.02));
  //     // Slow down as they get closer to the ground
  //     flight.speed = Math.max(140, flight.speed - 1);
  //   }
  // }
  private calculateNextFlightPosition(flight: FlightSimState) {
    let currentSpeed = flight.speed;
    if (this.activeWeatherEvent === 'TROPICAL_SQUALL' && flight.status === 'APPROACHING') {
      currentSpeed = currentSpeed * 0.8;
    }

    const headingRad = flight.heading * (Math.PI / 180);
    const distancePerTick = currentSpeed * 0.00005;

    flight.lat += Math.cos(headingRad) * distancePerTick;
    flight.lng += Math.sin(headingRad) * distancePerTick;

    // THE FIX: Flat descent rate for the demo
    if (flight.status === 'APPROACHING') {
      // Drops 1,000 feet every 3 seconds -> Lands exactly in 45 seconds
      flight.alt = Math.max(0, flight.alt - 1000);
      // Decelerate faster so it doesn't overshoot the runway
      flight.speed = Math.max(140, flight.speed - 3);
    }
  }

  /**
   * @description Automates the State Machine so the demo runs itself
   */
  private evaluateFlightStateTransition(flight: FlightSimState) {
    // If approaching and altitude hits 0, they have landed
    if (flight.status === 'APPROACHING' && flight.alt <= 10) {
      flight.status = 'LANDED';
      flight.alt = 0;
      flight.speed = 80; // Fast taxi speed off runway

      // Update DB and broadcast State Machine change
      this.flightService.updateStatus(flight.id, { status: 'LANDED' }).catch(console.error);
      console.log(`🛬 Flight ${flight.flightNumber} has LANDED.`);

      // Immediately transition to TAXIING after landing
      setTimeout(() => {
        if (this.flightStates.has(flight.id)) {
          const f = this.flightStates.get(flight.id)!;
          f.status = 'TAXIING';
          f.speed = 20; // Slow taxi to gate
          this.flightService.updateStatus(f.id, { status: 'TAXIING' }).catch(console.error);
        }
      }, 6000); // Wait 2 ticks
    }

    // If taxiing for a while (simulated by getting extremely close to center point), park them
    if (flight.status === 'TAXIING') {
      const distToCenter = Math.abs(flight.lat - this.LT_LAT) + Math.abs(flight.lng - this.LT_LNG);
      if (distToCenter < 0.005) {
        flight.status = 'PARKED';
        flight.speed = 0;

        this.flightService.updateStatus(flight.id, { status: 'PARKED' }).catch(console.error);
        console.log(`🛑 Flight ${flight.flightNumber} has PARKED.`);

        // Remove from active simulation to save memory (they are now static)
        this.flightStates.delete(flight.id);
      }
    }
  }
}
