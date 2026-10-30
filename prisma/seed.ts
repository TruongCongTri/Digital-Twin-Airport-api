/**
 * @file prisma/seed.ts
 * @description Populates the database with Multi-Airport configurations (VVLT, VVTS, VVGA & VVNG).
 */
import { 
  ZoneType, 
  FlightStatus,
  VehicleStatus
} from '../src/generated/index';
import { prisma } from '../src/common/configs/prisma';
import { TAN_SON_NHAT_COORDS, LONG_THANH_COORDS } from '../src/constants/airport-coordinates';

import {
  lerp,
  SENSOR_IMAGE_MAP,
  AIRLINES,
  PLANE_IMAGE_MAP,
  AIRLINE_IMAGE_MAP,
  VEHICLE_MOCKS,
  INDOOR_SENSOR_TYPES,
  OUTDOOR_SENSOR_TYPES,
} from './seeds/shared';
import { seedGreenAirport } from './seeds/green-airport.seed';
import { seedNhaGa } from './seeds/nha-ga.seed';

async function seedTanSonNhat() {
  console.log('--- Seeding Tan Son Nhat (VVTS) ---');
  
  const airport = await prisma.airport.create({
    data: {
      code: "VVTS",
      name: "Tan Son Nhat International Airport",
      latitude: TAN_SON_NHAT_COORDS.CENTER.lat,
      longitude: TAN_SON_NHAT_COORDS.CENTER.lng
    }
  });

  // 1. ZONES
  const intlTerm = await prisma.zone.create({
    data: { name: 'SGN T2 - International', type: ZoneType.TERMINAL_INTERNATIONAL, floorLevel: 2, airportId: airport.id }
  });
  const domTerm = await prisma.zone.create({
    data: { name: 'SGN T1 - Domestic', type: ZoneType.TERMINAL_DOMESTIC, floorLevel: 1, airportId: airport.id }
  });
  const runway25L = await prisma.zone.create({
    data: { name: 'Runway 25L/07R', type: ZoneType.RUNWAY, floorLevel: 0, airportId: airport.id }
  });
  const runway25R = await prisma.zone.create({
    data: { name: 'Runway 25R/07L', type: ZoneType.RUNWAY, floorLevel: 0, airportId: airport.id }
  });
  const apron = await prisma.zone.create({
    data: { name: 'SGN Main Apron', type: ZoneType.APRON, floorLevel: 0, airportId: airport.id }
  });

  // 2. PARKING STANDS (Generated along the provided lines)
  const intlStands = [];
  const domStands = [];
  
  const intlLine = TAN_SON_NHAT_COORDS.TERMINALS.INTERNATIONAL.parking;
  const domLine = TAN_SON_NHAT_COORDS.TERMINALS.DOMESTIC.parking;

  for(let i=0; i<7; i++) {
    const intlCoord = lerp(intlLine.start, intlLine.end, i/6);
    intlStands.push(await prisma.parkingStand.create({
      data: {
        code: `SGN-INTL-G${i+1}`, isOccupied: true, zoneId: apron.id, z: 0,
        x: intlCoord.lng, y: intlCoord.lat,
      }
    }));

    const domCoord = lerp(domLine.start, domLine.end, i/6);
    domStands.push(await prisma.parkingStand.create({
      data: {
        code: `SGN-DOM-G${i+1}`, isOccupied: true, zoneId: apron.id, z: 0,
        x: domCoord.lng, y: domCoord.lat,
      }
    }));
  }

  // 3. SENSORS
  const sensorsData: any[] = [];
  
  INDOOR_SENSOR_TYPES.forEach((type) => {
    sensorsData.push({ 
      name: `SGN-INT-${type}-01`, type, airportId: airport.id, zoneId: intlTerm.id, z: 10, 
      x: TAN_SON_NHAT_COORDS.TERMINALS.INTERNATIONAL.center.lng, 
      y: TAN_SON_NHAT_COORDS.TERMINALS.INTERNATIONAL.center.lat, 
      imageUrl: SENSOR_IMAGE_MAP[type] 
    });
    sensorsData.push({ 
      name: `SGN-DOM-${type}-01`, type, airportId: airport.id, zoneId: domTerm.id, z: 5, 
      x: TAN_SON_NHAT_COORDS.TERMINALS.DOMESTIC.center.lng, 
      y: TAN_SON_NHAT_COORDS.TERMINALS.DOMESTIC.center.lat, 
      imageUrl: SENSOR_IMAGE_MAP[type] 
    });
  });

  OUTDOOR_SENSOR_TYPES.forEach((type) => {
    // 25L-07R
    sensorsData.push({ 
      name: `SGN-RWY25L-${type}-E1`, type, airportId: airport.id, zoneId: runway25L.id, z: 0, 
      x: TAN_SON_NHAT_COORDS.RUNWAYS.RWY_25L_07R.start.lng, 
      y: TAN_SON_NHAT_COORDS.RUNWAYS.RWY_25L_07R.start.lat, 
      imageUrl: SENSOR_IMAGE_MAP[type] 
    });
    sensorsData.push({ 
      name: `SGN-RWY25L-${type}-E2`, type, airportId: airport.id, zoneId: runway25L.id, z: 0, 
      x: TAN_SON_NHAT_COORDS.RUNWAYS.RWY_25L_07R.end.lng, 
      y: TAN_SON_NHAT_COORDS.RUNWAYS.RWY_25L_07R.end.lat, 
      imageUrl: SENSOR_IMAGE_MAP[type] 
    });
    // 25R-07L
    sensorsData.push({ 
      name: `SGN-RWY25R-${type}-E1`, type, airportId: airport.id, zoneId: runway25R.id, z: 0, 
      x: TAN_SON_NHAT_COORDS.RUNWAYS.RWY_25R_07L.start.lng, 
      y: TAN_SON_NHAT_COORDS.RUNWAYS.RWY_25R_07L.start.lat, 
      imageUrl: SENSOR_IMAGE_MAP[type] 
    });
    sensorsData.push({ 
      name: `SGN-RWY25R-${type}-E2`, type, airportId: airport.id, zoneId: runway25R.id, z: 0, 
      x: TAN_SON_NHAT_COORDS.RUNWAYS.RWY_25R_07L.end.lng, 
      y: TAN_SON_NHAT_COORDS.RUNWAYS.RWY_25R_07L.end.lat, 
      imageUrl: SENSOR_IMAGE_MAP[type] 
    });
  });

  await prisma.sensor.createMany({ data: sensorsData });

  // 4. FLIGHTS
  const flightsData: any[] = [];
  
  for (let i = 0; i < 7; i++) {
    const airline = AIRLINES[i % AIRLINES.length];
    flightsData.push({
      flightNumber: `${airline.code}${200 + i}`,
      airline: airline.name,
      origin: 'SIN', destination: 'SGN',
      airportId: airport.id,
      status: FlightStatus.PARKED,
      direction: 'TURNAROUND',
      parkingStandId: intlStands[i].id,
      imageUrl: PLANE_IMAGE_MAP[airline.code],
      logoUrl: AIRLINE_IMAGE_MAP[airline.code]
    });
  }

  for (let i = 0; i < 7; i++) {
    const airline = AIRLINES[(i + 3) % AIRLINES.length];
    flightsData.push({
      flightNumber: `${airline.code}${400 + i}`,
      airline: airline.name,
      origin: 'HAN', destination: 'SGN',
      airportId: airport.id,
      status: FlightStatus.PARKED,
      direction: 'TURNAROUND',
      parkingStandId: domStands[i].id,
      imageUrl: PLANE_IMAGE_MAP[airline.code],
      logoUrl: AIRLINE_IMAGE_MAP[airline.code]
    });
  }

  await prisma.flight.createMany({ data: flightsData });

  // 5. GROUND VEHICLES (Civilian Traffic - Taxis & Cars)
  console.log('🚗 Deploying Civilian Ground Traffic...');
  
  const intlTaxiPath = TAN_SON_NHAT_COORDS.ROUTES.INTERNATIONAL.taxiPath;
  const domTaxiPath = TAN_SON_NHAT_COORDS.ROUTES.DOMESTIC.taxiPath;

  for (let i = 0; i < 6; i++) {
    const mockInfo = VEHICLE_MOCKS[i % VEHICLE_MOCKS.length];
    
    // Distribute cars between Domestic and International terminals
    const path = i % 2 === 0 ? intlTaxiPath : domTaxiPath;

    if (!path || path.length === 0) continue;

    const vehicle = await prisma.groundVehicle.create({
      data: {
        licensePlate: `51F-${10000 + (i * 123)}`,
        type: mockInfo.type,
        status: VehicleStatus.APPROACHING_DROP_OFF,
        brand: mockInfo.brand,
        carModel: mockInfo.carModel,
        companyName: mockInfo.companyName,
        logoUrl: mockInfo.logoUrl,
        airportId: airport.id,
      }
    });

    // Stagger their initial positions along the drop-off route
    const startPoint = path[Math.min(i, path.length - 1)];

    await prisma.vehicleTelemetry.create({
      data: {
        vehicleId: vehicle.id,
        longitude: startPoint.lng,
        latitude: startPoint.lat,
        speed: 15,
        heading: 0, // Will be calculated immediately by the simulation engine
        batteryLevel: mockInfo.companyName === 'Xanh SM' ? 85 : null
      }
    });
  }
}

async function seedLongThanh() {
  console.log('--- Seeding Long Thanh (VVLT) ---');
  
  const airport = await prisma.airport.create({
    data: {
      code: "VVLT",
      name: "Long Thanh International Airport",
      latitude: LONG_THANH_COORDS.CENTER.lat,
      longitude: LONG_THANH_COORDS.CENTER.lng
    }
  });

  // Zones
  const t1CheckIn = await prisma.zone.create({ data: { name: 'T1 Check-in', type: ZoneType.CHECK_IN, floorLevel: 1, airportId: airport.id }});
  const apron = await prisma.zone.create({ data: { name: 'LTN Apron', type: ZoneType.APRON, floorLevel: 0, airportId: airport.id }});

  // Parking Stands
  const stands = [];
  const terminals = [
    LONG_THANH_COORDS.TERMINALS.T1_RIGHT,
    LONG_THANH_COORDS.TERMINALS.T2_CENTER,
    LONG_THANH_COORDS.TERMINALS.T3_LEFT,
  ];

  let standCounter = 1;
  for (let t = 0; t < terminals.length; t++) {
    const term = terminals[t];
    for (let i = 0; i < 5; i++) {
      // Stands sit on the apron beside each pier (derived from OSM gates)
      const coord = term.stands[i]!;
      stands.push(await prisma.parkingStand.create({
        data: {
          code: `LTN-T${t + 1}-G${i + 1}`, 
          isOccupied: standCounter <= 10,
          zoneId: apron.id, z: 0,
          x: coord.lng, y: coord.lat
        }
      }));
      standCounter++;
    }
  }

  // Sensors
  const sensorsData: any[] = [];
  INDOOR_SENSOR_TYPES.forEach((type) => {
    for(let i=0; i<3; i++) {
      const anchor = LONG_THANH_COORDS.SENSOR_ANCHORS.INDOOR[i]!; // inside the terminal hall
      sensorsData.push({ name: `LTN-${type}-${i}`, type, airportId: airport.id, zoneId: t1CheckIn.id, x: anchor.lng, y: anchor.lat, z: 5, imageUrl: SENSOR_IMAGE_MAP[type] });
    }
  });
  OUTDOOR_SENSOR_TYPES.forEach((type) => {
    for(let i=0; i<3; i++) {
      const anchor = LONG_THANH_COORDS.SENSOR_ANCHORS.OUTDOOR[i]!; // runway thresholds + apron
      sensorsData.push({ name: `LTN-OUT-${type}-${i}`, type, airportId: airport.id, zoneId: apron.id, x: anchor.lng, y: anchor.lat, z: 0, imageUrl: SENSOR_IMAGE_MAP[type] });
    }
  });
  await prisma.sensor.createMany({ data: sensorsData });

  // Flights
  const flightsData: any[] = [];
  for (let i = 0; i < 10; i++) {
    const airline = AIRLINES[i % AIRLINES.length];
    flightsData.push({
      flightNumber: `${airline.code}${300 + i}`,
      airline: airline.name,
      origin: 'SIN', destination: 'LTN',
      airportId: airport.id,
      status: FlightStatus.PARKED,
      direction: 'TURNAROUND',
      parkingStandId: stands[i].id,
      imageUrl: PLANE_IMAGE_MAP[airline.code],
      logoUrl: AIRLINE_IMAGE_MAP[airline.code]
    });
  }
  await prisma.flight.createMany({ data: flightsData });

  // Ground Vehicles
  const ltnTaxiPath = (LONG_THANH_COORDS.ROUTES.T1.taxiPath as { lat: number; lng: number }[]) || [];
  if (ltnTaxiPath.length > 0) {
    for (let i = 0; i < 4; i++) {
      const mockInfo = VEHICLE_MOCKS[i % VEHICLE_MOCKS.length];
      const vehicle = await prisma.groundVehicle.create({
        data: {
          licensePlate: `60A-${20000 + (i * 123)}`, // Dong Nai province plate for authenticity
          type: mockInfo.type,
          status: VehicleStatus.APPROACHING_DROP_OFF,
          brand: mockInfo.brand,
          carModel: mockInfo.carModel,
          companyName: mockInfo.companyName,
          logoUrl: mockInfo.logoUrl,
          airportId: airport.id,
        }
      });
      await prisma.vehicleTelemetry.create({
        data: {
          vehicleId: vehicle.id,
          longitude: ltnTaxiPath[0].lng,
          latitude: ltnTaxiPath[0].lat,
          speed: 15,
          heading: 0,
        }
      });
    }
  }
}

async function main() {
  console.log('🌱 Starting Database Wipe & Seed...');

  // Wipe existing db to prevent un-migrated conflicts
  await prisma.vehicleTelemetry.deleteMany();
  await prisma.groundVehicle.deleteMany();
  await prisma.flightTelemetry.deleteMany();
  await prisma.flight.deleteMany();
  await prisma.sensorLog.deleteMany();
  await prisma.sensor.deleteMany();
  await prisma.parkingStand.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.airport.deleteMany();

  await seedTanSonNhat();
  await seedLongThanh();
  await seedGreenAirport();
  await seedNhaGa();

  console.log('✅ Multi-Tenant Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });