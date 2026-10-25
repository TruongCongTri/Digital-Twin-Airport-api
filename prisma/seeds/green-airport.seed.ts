/**
 * @file prisma/seeds/green-airport.seed.ts
 * @description Seeds Vietnam Green Airport (VVGA), the terminal modelled in
 * src/data/Vietnam_Green_Airport_Coordination_Revit2024.ifc. Sensor placement follows the
 * existing airports: indoor sensor types per terminal wing (at the IFC storey elevations),
 * outdoor sensor types at both ends of every runway, plus structural tilt sensors on the
 * timber roof and control tower that the IFC models explicitly.
 */
import { ZoneType, SensorType, FlightStatus, VehicleStatus } from '../../src/generated/index';
import { prisma } from '../../src/common/configs/prisma';
import { GREEN_AIRPORT_COORDS } from '../../src/constants/green-airport-coordinates';
import {
  lerp,
  SENSOR_IMAGE_MAP,
  AIRLINES,
  PLANE_IMAGE_MAP,
  AIRLINE_IMAGE_MAP,
  VEHICLE_MOCKS,
  INDOOR_SENSOR_TYPES,
  OUTDOOR_SENSOR_TYPES,
} from './shared';

const COORDS = GREEN_AIRPORT_COORDS;
const STAND_COUNT = 6;
const PARKED_FLIGHTS = 4;
const QUEUED_FLIGHTS = 4;

export async function seedGreenAirport() {
  console.log(`--- Seeding ${COORDS.NAME} (${COORDS.CODE}) ---`);

  const airport = await prisma.airport.create({
    data: {
      code: COORDS.CODE,
      name: COORDS.NAME,
      latitude: COORDS.CENTER.lat,
      longitude: COORDS.CENTER.lng,
    },
  });

  // 1. ZONES (terminal zones follow the IFC storeys)
  const checkIn = await prisma.zone.create({
    data: { name: 'VGA L01 - Check-in Hall', type: ZoneType.CHECK_IN, floorLevel: 1, airportId: airport.id },
  });
  const departures = await prisma.zone.create({
    data: { name: 'VGA L02 - Departures Lounge', type: ZoneType.WAITING_LOUNGE, floorLevel: 2, airportId: airport.id },
  });
  const concourse = await prisma.zone.create({
    data: { name: 'VGA L03 - Concourse', type: ZoneType.TERMINAL_INTERNATIONAL, floorLevel: 3, airportId: airport.id },
  });
  const runwayNorth = await prisma.zone.create({
    data: { name: 'Runway 07R/25L', type: ZoneType.RUNWAY, floorLevel: 0, airportId: airport.id },
  });
  const runwaySouth = await prisma.zone.create({
    data: { name: 'Runway 06L/24R', type: ZoneType.RUNWAY, floorLevel: 0, airportId: airport.id },
  });
  const apron = await prisma.zone.create({
    data: { name: 'VGA Main Apron', type: ZoneType.APRON, floorLevel: 0, airportId: airport.id },
  });

  // 2. PARKING STANDS (along the airside face of the terminal)
  const parkingLine = COORDS.TERMINALS.MAIN.parking;
  const stands = [];
  for (let i = 0; i < STAND_COUNT; i++) {
    const coord = lerp(parkingLine.start, parkingLine.end, i / (STAND_COUNT - 1));
    stands.push(
      await prisma.parkingStand.create({
        data: {
          code: `VGA-MAIN-G${i + 1}`,
          isOccupied: i < PARKED_FLIGHTS,
          zoneId: apron.id,
          z: 0,
          x: coord.lng,
          y: coord.lat,
        },
      })
    );
  }

  // 3. SENSORS
  const sensorsData: any[] = [];
  const { wings, roof, tower } = COORDS.TERMINALS.MAIN;
  const wingZones = [
    { key: 'WEST', zoneId: checkIn.id, anchor: wings.WEST },
    { key: 'CTR', zoneId: departures.id, anchor: wings.CENTER },
    { key: 'EAST', zoneId: concourse.id, anchor: wings.EAST },
  ];

  INDOOR_SENSOR_TYPES.forEach((type) => {
    wingZones.forEach(({ key, zoneId, anchor }) => {
      sensorsData.push({
        name: `VGA-${key}-${type}-01`,
        type,
        airportId: airport.id,
        zoneId,
        z: anchor.z,
        x: anchor.point.lng,
        y: anchor.point.lat,
        imageUrl: SENSOR_IMAGE_MAP[type],
      });
    });
  });

  const runways = [
    { key: 'RWY07R', zoneId: runwayNorth.id, runway: COORDS.RUNWAYS.RWY_07R_25L },
    { key: 'RWY06L', zoneId: runwaySouth.id, runway: COORDS.RUNWAYS.RWY_06L_24R },
  ];
  OUTDOOR_SENSOR_TYPES.forEach((type) => {
    runways.forEach(({ key, zoneId, runway }) => {
      [runway.start, runway.end].forEach((point, i) => {
        sensorsData.push({
          name: `VGA-${key}-${type}-E${i + 1}`,
          type,
          airportId: airport.id,
          zoneId,
          z: 0,
          x: point.lng,
          y: point.lat,
          imageUrl: SENSOR_IMAGE_MAP[type],
        });
      });
    });
  });

  // Structural health monitoring on the IFC's timber roof trusses and control tower
  sensorsData.push(
    {
      name: 'VGA-STR-ROOF-TILT_STRUCTURAL-01',
      type: SensorType.TILT_STRUCTURAL,
      airportId: airport.id,
      zoneId: concourse.id,
      z: roof.z,
      x: roof.point.lng,
      y: roof.point.lat,
      imageUrl: SENSOR_IMAGE_MAP.TILT_STRUCTURAL,
    },
    {
      name: 'VGA-STR-TOWER-TILT_STRUCTURAL-01',
      type: SensorType.TILT_STRUCTURAL,
      airportId: airport.id,
      zoneId: apron.id,
      z: tower.z,
      x: tower.point.lng,
      y: tower.point.lat,
      imageUrl: SENSOR_IMAGE_MAP.TILT_STRUCTURAL,
    }
  );

  await prisma.sensor.createMany({ data: sensorsData });

  // 4. FLIGHTS (parked at the first stands, the rest queued for the ATC pipeline)
  const ORIGINS = ['SGN', 'DAD', 'ICN', 'SIN', 'BKK', 'NRT', 'CXR', 'PQC'];
  const flightsData: any[] = [];
  for (let i = 0; i < PARKED_FLIGHTS + QUEUED_FLIGHTS; i++) {
    const airline = AIRLINES[(i + 1) % AIRLINES.length]!;
    const isParked = i < PARKED_FLIGHTS;
    flightsData.push({
      flightNumber: `${airline.code}${600 + i}`,
      airline: airline.name,
      origin: ORIGINS[i % ORIGINS.length],
      destination: 'VGA',
      airportId: airport.id,
      status: isParked ? FlightStatus.PARKED : FlightStatus.SCHEDULED,
      direction: 'TURNAROUND',
      parkingStandId: isParked ? stands[i]!.id : null,
      imageUrl: PLANE_IMAGE_MAP[airline.code],
      logoUrl: AIRLINE_IMAGE_MAP[airline.code],
    });
  }
  await prisma.flight.createMany({ data: flightsData });

  // 5. GROUND VEHICLES (landside curb loop)
  const taxiPath = COORDS.ROUTES.MAIN.taxiPath;
  for (let i = 0; i < 4; i++) {
    const mockInfo = VEHICLE_MOCKS[i % VEHICLE_MOCKS.length]!;
    const vehicle = await prisma.groundVehicle.create({
      data: {
        licensePlate: `99A-${30000 + i * 123}`, // Bac Ninh province plate
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

  console.log(`✅ ${COORDS.CODE}: ${STAND_COUNT} stands, ${sensorsData.length} sensors, ${flightsData.length} flights, 4 vehicles`);
}

/**
 * @description Removes only VVGA rows, so it can be re-seeded without touching other airports.
 */
export async function removeGreenAirport() {
  const airport = await prisma.airport.findUnique({ where: { code: COORDS.CODE } });
  if (!airport) return;

  const airportId = airport.id;
  await prisma.vehicleTelemetry.deleteMany({ where: { vehicle: { airportId } } });
  await prisma.groundVehicle.deleteMany({ where: { airportId } });
  await prisma.flightTelemetry.deleteMany({ where: { flight: { airportId } } });
  await prisma.flight.deleteMany({ where: { airportId } });
  await prisma.sensorLog.deleteMany({ where: { sensor: { airportId } } });
  await prisma.sensor.deleteMany({ where: { airportId } });
  await prisma.parkingStand.deleteMany({ where: { zone: { airportId } } });
  await prisma.zone.deleteMany({ where: { airportId } });
  await prisma.airport.delete({ where: { id: airportId } });
}
