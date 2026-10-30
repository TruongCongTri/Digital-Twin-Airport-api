/**
 * @file prisma/seeds/nha-ga.seed.ts
 * @description Seeds the Nha Ga site (VVNG) from `src/data/nhà gaaa.ifc`. The model has no
 * interior, so every zone is outdoor: air-quality and crowd sensors stand on the plaza, and
 * wind, tarmac and structural sensors at the pads, the road and both runway ends.
 */
import { ZoneType, SensorType, FlightStatus, VehicleStatus } from '../../src/generated/index';
import { prisma } from '../../src/common/configs/prisma';
import { NHA_GA_COORDS } from '../../src/constants/nha-ga-coordinates';
import {
  SENSOR_IMAGE_MAP,
  AIRLINES,
  PLANE_IMAGE_MAP,
  AIRLINE_IMAGE_MAP,
  VEHICLE_MOCKS,
  OUTDOOR_SENSOR_TYPES,
} from './shared';

const COORDS = NHA_GA_COORDS;
const PLAZA_SENSOR_TYPES: SensorType[] = [
  SensorType.CO2,
  SensorType.TEMPERATURE,
  SensorType.HUMIDITY,
  SensorType.LIGHT_DENSITY,
  SensorType.CAMERA_AI_CROWD,
];

type FlightSeed = {
  status: FlightStatus;
  direction: 'INBOUND' | 'OUTBOUND' | 'TURNAROUND';
  route: [string, string]; // [origin, destination]
  stand?: number; // index into the stands; on-airport flights only
};

// Same mix as VVGA: gates, one taxiing in, one on approach, plus queued and disrupted flights
const FLIGHT_BOARD: FlightSeed[] = [
  { status: FlightStatus.PARKED, direction: 'TURNAROUND', route: ['HAN', 'NGA'], stand: 0 },
  { status: FlightStatus.PARKED, direction: 'TURNAROUND', route: ['BKK', 'NGA'], stand: 3 },
  { status: FlightStatus.PARKED, direction: 'TURNAROUND', route: ['SGN', 'NGA'], stand: 1 },
  { status: FlightStatus.TAXIING, direction: 'INBOUND', route: ['ICN', 'NGA'], stand: 4 },
  { status: FlightStatus.APPROACHING, direction: 'INBOUND', route: ['SIN', 'NGA'], stand: 2 },
  { status: FlightStatus.SCHEDULED, direction: 'INBOUND', route: ['DAD', 'NGA'] },
  { status: FlightStatus.SCHEDULED, direction: 'INBOUND', route: ['TPE', 'NGA'] },
  { status: FlightStatus.DELAYED, direction: 'INBOUND', route: ['HKG', 'NGA'] },
  { status: FlightStatus.DEPARTED, direction: 'OUTBOUND', route: ['NGA', 'NRT'] },
  { status: FlightStatus.DEPARTED, direction: 'OUTBOUND', route: ['NGA', 'PQC'] },
  { status: FlightStatus.CANCELLED, direction: 'INBOUND', route: ['KUL', 'NGA'] },
  { status: FlightStatus.DIVERTED, direction: 'INBOUND', route: ['CXR', 'NGA'] },
];

export async function seedNhaGa() {
  console.log(`--- Seeding ${COORDS.NAME} (${COORDS.CODE}) ---`);

  const airport = await prisma.airport.create({
    data: {
      code: COORDS.CODE,
      name: COORDS.NAME,
      latitude: COORDS.CENTER.lat,
      longitude: COORDS.CENTER.lng,
    },
  });

  // 1. ZONES
  const plaza = await prisma.zone.create({
    data: { name: 'NGA Forecourt Plaza', type: ZoneType.APRON, floorLevel: 0, airportId: airport.id },
  });
  const apron = await prisma.zone.create({
    data: { name: 'NGA Paved Pads', type: ZoneType.APRON, floorLevel: 0, airportId: airport.id },
  });
  const runway = await prisma.zone.create({
    data: { name: 'Runway 07/25', type: ZoneType.RUNWAY, floorLevel: 0, airportId: airport.id },
  });

  // 2. PARKING STANDS (WEST 1-3, EAST 1-3)
  const stands: { id: string }[] = [];
  for (const [side, coords] of Object.entries(COORDS.SITE.stands)) {
    for (const [i, coord] of coords.entries()) {
      stands.push(
        await prisma.parkingStand.create({
          data: {
            code: `NGA-${side}-G${i + 1}`,
            isOccupied: FLIGHT_BOARD.some((f) => f.stand === stands.length),
            zoneId: apron.id,
            z: 0,
            x: coord.lng,
            y: coord.lat,
          },
        })
      );
    }
  }

  // 3. SENSORS
  const sensorsData = PLAZA_SENSOR_TYPES.map((type) => ({
    name: `NGA-PLAZA-${type}-01`,
    type,
    airportId: airport.id,
    zoneId: plaza.id,
    z: 0.6,
    x: COORDS.SITE.plaza.lng,
    y: COORDS.SITE.plaza.lat,
    imageUrl: SENSOR_IMAGE_MAP[type] ?? null,
  }));

  const mounts = [
    { key: 'FOUNTAIN', zoneId: plaza.id, point: COORDS.SITE.fountain, z: 1.5 },
    { key: 'ROAD', zoneId: plaza.id, point: COORDS.SITE.road, z: 0.6 },
    { key: 'PAD-W', zoneId: apron.id, point: COORDS.SITE.stands.WEST[1]!, z: 0.6 },
    { key: 'PAD-E', zoneId: apron.id, point: COORDS.SITE.stands.EAST[1]!, z: 0.6 },
    { key: 'RWY-E1', zoneId: runway.id, point: COORDS.RUNWAYS.RWY_07_25.start, z: 0 },
    { key: 'RWY-E2', zoneId: runway.id, point: COORDS.RUNWAYS.RWY_07_25.end, z: 0 },
  ];
  for (const type of OUTDOOR_SENSOR_TYPES) {
    for (const { key, zoneId, point, z } of mounts) {
      sensorsData.push({
        name: `NGA-${key}-${type}-01`,
        type,
        airportId: airport.id,
        zoneId,
        z,
        x: point.lng,
        y: point.lat,
        imageUrl: SENSOR_IMAGE_MAP[type] ?? null,
      });
    }
  }
  await prisma.sensor.createMany({ data: sensorsData });

  // 4. FLIGHTS
  await prisma.flight.createMany({
    data: FLIGHT_BOARD.map((f, i) => {
      const airline = AIRLINES[(i + 2) % AIRLINES.length]!;
      return {
        flightNumber: `${airline.code}${700 + i}`,
        airline: airline.name,
        origin: f.route[0],
        destination: f.route[1],
        airportId: airport.id,
        status: f.status,
        direction: f.direction,
        parkingStandId: f.stand !== undefined ? stands[f.stand]!.id : null,
        imageUrl: PLANE_IMAGE_MAP[airline.code] ?? null,
        logoUrl: AIRLINE_IMAGE_MAP[airline.code] ?? null,
      };
    }),
  });

  // 5. GROUND VEHICLES (landside road loop)
  const taxiPath = COORDS.ROUTES.WEST.taxiPath;
  for (let i = 0; i < 4; i++) {
    const mockInfo = VEHICLE_MOCKS[i % VEHICLE_MOCKS.length]!;
    const vehicle = await prisma.groundVehicle.create({
      data: {
        licensePlate: `98A-${40000 + i * 123}`,
        type: mockInfo.type,
        status: VehicleStatus.APPROACHING_DROP_OFF,
        brand: mockInfo.brand,
        carModel: mockInfo.carModel,
        companyName: mockInfo.companyName,
        logoUrl: mockInfo.logoUrl,
        airportId: airport.id,
      },
    });

    const startPoint = taxiPath[Math.min(i, taxiPath.length - 1)]!;
    await prisma.vehicleTelemetry.create({
      data: {
        vehicleId: vehicle.id,
        longitude: startPoint.lng,
        latitude: startPoint.lat,
        speed: 15,
        heading: 0,
        batteryLevel: mockInfo.companyName === 'Xanh SM' ? 85 : null,
      },
    });
  }

  console.log(
    `✅ ${COORDS.CODE}: ${stands.length} stands, ${sensorsData.length} sensors, ${FLIGHT_BOARD.length} flights, 4 vehicles`
  );
}
