/**
 * @file prisma/seed.ts
 * @description Populates the database with Dual-Airport configurations (VVLT & VVTS).
 */
import { 
  ZoneType, 
  SensorType, 
  FlightStatus,
  VehicleType,
  VehicleStatus
} from '../src/generated/index';
import { prisma } from '../src/common/configs/prisma';
import { TAN_SON_NHAT_COORDS, LONG_THANH_COORDS } from '../src/constants/airport-coordinates';

// Linear interpolation helper for drawing parking stands along a line
const lerp = (start: {lng: number, lat: number}, end: {lng: number, lat: number}, fraction: number) => {
  return {
    lng: start.lng + (end.lng - start.lng) * fraction,
    lat: start.lat + (end.lat - start.lat) * fraction
  };
};

// Constants & Assets
const SENSOR_IMAGE_MAP: Record<string, string> = {
  TEMPERATURE: "https://bravocontrols.com/wp-content/uploads/2024/05/HUM-C1-Web1.jpg",
  HUMIDITY: "https://bravocontrols.com/wp-content/uploads/2024/05/HUM-C1-Web1.jpg",
  CO2: "https://www.zoko-link.com/static/upload/image/20220723/1658567924148123.jpg",
  WIND_INDOOR: "https://www.sevensensor.com/files/2023/11/Ultrasonic_Anemometer.jpg",
  WIND_OUTDOOR: "https://assets.tempcon.co.uk/media/catalog/product/w/i/wind-smart-sensor-set_s-wset-a.jpg?q=80&canvas.width=625&canvas.height=500&canvas.color=ffffff&w=341&h=500",
  LIGHT_DENSITY: "https://www.l-com.com/Content/Images/Product/Large/SRMS-D469-1_500x500_View1.jpg",
  TILT_STRUCTURAL: "https://www.worldsensing.com/wp-content/uploads/2025/10/LSG7ACL-BXLH-TIL_WB.webp",
  CAMERA_AI_CROWD: "https://www.taiwanexcellence.org/upload/product/old/old2020/110044AB-V013_L.jpg",
  TARMAC_TEMP: "https://observator.com/wp-content/uploads/2019/07/Passive-Road-Surface-Temp-Sensor.jpg"
};

const AIRLINES = [
  { code: 'VJ', name: 'VietJet Air' },
  { code: 'VN', name: 'Vietnam Airlines' },
  { code: 'QH', name: 'Bamboo Airways' },
  { code: 'CX', name: 'Cathay Pacific' },
  { code: 'SQ', name: 'Singapore Airlines' },
  { code: 'EK', name: 'Emirates' },
  { code: 'NH', name: 'ANA' },
];

const PLANE_IMAGE_MAP: Record<string, string> = {
  'VJ': "https://upload.wikimedia.org/wikipedia/commons/f/f0/VN-A651_%2840070794875%29.jpg",
  'VN': "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/VN-A868_Boeing_787-9_Vietnam_Airlines_LHR_3.1.25_%2854244914084%29.jpg/960px-VN-A868_Boeing_787-9_Vietnam_Airlines_LHR_3.1.25_%2854244914084%29.jpg",
  'QH': "https://upload.wikimedia.org/wikipedia/commons/1/12/Bamboo_Airlines%27_first_A321_Neo.jpg",
  'CX': "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Cathay_Pacific_A350-1000XWB_B-LXA.jpg/1280px-Cathay_Pacific_A350-1000XWB_B-LXA.jpg",
  'SQ': "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/9V-SKA_-_Singapore_Airlines_-_Airbus_A380-841_-_HKG_%2813289535585%29.jpg/1280px-9V-SKA_-_Singapore_Airlines_-_Airbus_A380-841_-_HKG_%2813289535585%29.jpg",
  'EK': "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/A6-EOM%40PEK_%2820260504153037%29.jpg/1280px-A6-EOM%40PEK_%2820260504153037%29.jpg",
  'NH': "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/JA797A-LHR-20240410-192710.jpg/1280px-JA797A-LHR-20240410-192710.jpg"
};

const AIRLINE_IMAGE_MAP: Record<string, string> = {
  'VJ': "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/VietJet_Air_logo.svg/330px-VietJet_Air_logo.svg.png",
  'VN': "https://upload.wikimedia.org/wikipedia/en/thumb/b/b6/Vietnam_Airlines_logo_2015.svg/250px-Vietnam_Airlines_logo_2015.svg.png",
  'QH': "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Bamboo_Airways_Logo.svg/250px-Bamboo_Airways_Logo.svg.png",
  'CX': "https://upload.wikimedia.org/wikipedia/en/thumb/1/17/Cathay_Pacific_logo.svg/250px-Cathay_Pacific_logo.svg.png",
  'SQ': "https://upload.wikimedia.org/wikipedia/vi/thumb/9/9d/Singapore_Airlines_Logo.svg/330px-Singapore_Airlines_Logo.svg.png",
  'EK': "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Emirates_Logo.svg/250px-Emirates_Logo.svg.png",
  'NH': "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/All_Nippon_Airways_Logo.svg/250px-All_Nippon_Airways_Logo.svg.png"
};

const INDOOR_SENSOR_TYPES = [SensorType.CO2, SensorType.TEMPERATURE, SensorType.HUMIDITY, SensorType.WIND_INDOOR, SensorType.LIGHT_DENSITY, SensorType.CAMERA_AI_CROWD];
const OUTDOOR_SENSOR_TYPES = [SensorType.WIND_OUTDOOR, SensorType.TARMAC_TEMP, SensorType.TILT_STRUCTURAL];


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
    const airline = AIRLINES[(i + 3) % AIRLINES.length]; // Offset so we get different airlines
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

  // 5. GROUND VEHICLES (Taxis / Baggage Tugs / Buses)
  console.log('🚜 Deploying Ground Support Equipment...');
  
  const intlTaxiPath = TAN_SON_NHAT_COORDS.ROUTES.INTERNATIONAL.taxiPath;
  const domTaxiPath = TAN_SON_NHAT_COORDS.ROUTES.DOMESTIC.taxiPath;

  for (let i = 0; i < 3; i++) {
    // International Tugs
    const intlVehicle = await prisma.groundVehicle.create({
      data: {
        callsign: `SGN-INTL-TUG-0${i + 1}`,
        type: VehicleType.BAGGAGE_TUG,
        status: VehicleStatus.DISPATCHED,
        airportId: airport.id,
      }
    });
    // Drop them physically on the taxiway
    await prisma.vehicleTelemetry.create({
      data: {
        vehicleId: intlVehicle.id,
        longitude: intlTaxiPath[i * 2].lng, // Stagger them along the path
        latitude: intlTaxiPath[i * 2].lat,
        speed: 15,
        batteryLevel: 85
      }
    });

    // Domestic Passenger Buses
    const domVehicle = await prisma.groundVehicle.create({
      data: {
        callsign: `SGN-DOM-BUS-0${i + 1}`,
        type: VehicleType.PASSENGER_BUS,
        status: VehicleStatus.DISPATCHED,
        airportId: airport.id,
      }
    });
    await prisma.vehicleTelemetry.create({
      data: {
        vehicleId: domVehicle.id,
        longitude: domTaxiPath[i * 2].lng,
        latitude: domTaxiPath[i * 2].lat,
        speed: 20,
        batteryLevel: 90
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

  // Parking Stands (Using the unified nested "parking" constant)
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
      const coord = lerp(term.parking.start, term.parking.end, i / 4);
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
      sensorsData.push({ name: `LTN-${type}-${i}`, type, airportId: airport.id, zoneId: t1CheckIn.id, x: 107.0422 + (i*0.001), y: 10.7731, z: 5, imageUrl: SENSOR_IMAGE_MAP[type] });
    }
  });
  OUTDOOR_SENSOR_TYPES.forEach((type) => {
    for(let i=0; i<3; i++) {
      sensorsData.push({ name: `LTN-OUT-${type}-${i}`, type, airportId: airport.id, zoneId: apron.id, x: 107.064 + (i*0.001), y: 10.802, z: 0, imageUrl: SENSOR_IMAGE_MAP[type] });
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