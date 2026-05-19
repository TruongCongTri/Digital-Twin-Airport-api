import { prisma } from '@/common/configs/prisma';
import { SensorType } from '@/generated/client';
import { APP_CONFIG } from '@/constants/app.constant';
import { socketConfig } from '@/common/configs/socket';
// import { io } from '@/server'; // Assuming you have an exported Socket.io instance

export class SimulationService {
  // 1. Singleton Instance setup
  private static instance: SimulationService;

  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private currentTick = 0;
  private sensorStates: Map<string, { value: number; type: SensorType }> = new Map();

  // --- ENVIRONMENT STATE ---
  private currentVirtualDate: Date = new Date(); // Allows us to manipulate time later
  private activeWeatherEvent: 'NONE' | 'TROPICAL_SQUALL' = 'NONE';
  private weatherEventTicksRemaining = 0;

  // Make constructor private for Singleton pattern
  private constructor() {}

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
    if (this.isRunning) return { message: '[Simulation Engine] is already running.' };

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

    this.isRunning = true;

    // 2. Start the heartbeat loop
    this.intervalId = setInterval(() => this.tick(), APP_CONFIG.SIMULATION.TICK_RATE_MS);
    return { message: 'Simulation engine started.' };
  }

  public stop(): { message: string } {
    if (!this.isRunning) return { message: 'Simulation is not running.' };

    if (this.intervalId) clearInterval(this.intervalId);
    this.isRunning = false;
    return { message: 'Simulation engine stopped.' };
  }

  /**
   * @description The core loop executed every 3 seconds
   */
  private async tick() {
    this.currentTick++;
    const isDbSaveTick = this.currentTick % APP_CONFIG.SIMULATION.DB_SAVE_TICK_MODULO === 0;
    const io = socketConfig.getIO();

    // 1. Update Environment Time & Weather
    // Advance virtual time by 3 seconds per tick (or faster if you want to speed up a demo)
    this.currentVirtualDate.setSeconds(this.currentVirtualDate.getSeconds() + 3);
    this.processWeatherEvents();

    const hour = this.currentVirtualDate.getHours();
    const loadMultiplier = this.getPassengerLoadMultiplier(hour);
    const solarMultiplier = this.getSolarIntensityMultiplier(hour);

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

    // 4. Execute DB transactions in a batch to save connection pool
    if (isDbSaveTick && dbUpdates.length > 0) {
      try {
        await prisma.$transaction([
          ...dbUpdates,
          prisma.sensorLog.createMany({ data: logsToInsert }),
        ]);
      } catch (error) {
        console.error('[Simulation Engine] DB Save Failed:', error);
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
        this.weatherEventTicksRemaining = 200; // Force ~10-minute storm
        break;

      case 'TARMAC_OVERHEAT':
        // FIX: Use .values() to iterate directly over the state objects, ignoring the ID keys
        for (const state of this.sensorStates.values()) {
          if (state.type === 'TARMAC_TEMP') state.value = 65.5;
        }
        break;

      case 'AC_FAILURE':
        // FIX: Use .values() here as well
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

    const noise = (Math.random() - 0.5) * noiseLimit;

    // Format safely to prevent negative values
    const nextValue = Math.max(0, current + step + noise);

    // Format decimal places based on sensor precision requirements
    if (type === 'TILT_STRUCTURAL') return Number(nextValue.toFixed(4));
    if (type === 'LIGHT_DENSITY' || type === 'CO2') return Number(nextValue.toFixed(0));

    return Number(nextValue.toFixed(2));
  }
}
