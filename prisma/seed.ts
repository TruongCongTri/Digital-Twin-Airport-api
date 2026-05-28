/**
 * @file prisma/seed.ts
 * @description Populates the database with initial Long Thanh Airport Zones and Sensors.
 */
import { ZoneType, SensorType, SensorStatus, FlightStatus } from '../src/generated/client';
import { prisma } from '../src/common/configs/prisma';
import { LONG_THANH_COORDS } from '../src/constants/airport-coordinates';

async function main() {
  console.log('🌱 Starting Long Thanh Digital Twin database seed...');

  // ==========================================
  // 1. INFRASTRUCTURE: ZONES & SENSORS
  // ==========================================
  console.log('🚧 Building Terminal Infrastructure...');

  const t1CheckIn = await prisma.zone.create({
    data: {
      name: 'T1 - Domestic Check-in',
      type: ZoneType.CHECK_IN,
      floorLevel: 1,
      maxCapacity: 2000,
    },
  });
  const t1Security = await prisma.zone.create({
    data: {
      name: 'T1 - Main Security Screening',
      type: ZoneType.SECURITY_GATE,
      floorLevel: 1,
      maxCapacity: 500,
    },
  });
  const t2CheckIn = await prisma.zone.create({
    data: {
      name: 'T2 - International Check-in',
      type: ZoneType.CHECK_IN,
      floorLevel: 2,
      maxCapacity: 2500,
    },
  });
  const t2Security = await prisma.zone.create({
    data: {
      name: 'T2 - Int Security Screening',
      type: ZoneType.SECURITY_GATE,
      floorLevel: 2,
      maxCapacity: 600,
    },
  });
  const apron = await prisma.zone.create({
    data: { name: 'Apron - Main Tarmac', type: ZoneType.APRON, floorLevel: 0, maxCapacity: 50 },
  });

  const indoorZones = [t1CheckIn, t1Security, t2CheckIn, t2Security];
  const outdoorZones = [apron];
  const allZones = [...indoorZones, ...outdoorZones];

  // Map Sensor Types to relevant images
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

// Map Airline Codes to branded aircraft images
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
  // ==========================================
  // 2. IOT SENSORS (5 of each type)
  // ==========================================

  console.log('📡 Deploying Sensors...');

  const sensorTypes = Object.values(SensorType);
  const sensorsData: any[] = [];

  const baseX = LONG_THANH_COORDS.CENTER.lng;
  const baseY = LONG_THANH_COORDS.CENTER.lat;

  // 10.750010815599236, 107.01369432683721
  sensorTypes.forEach((type) => {
    // Determine if this sensor type is strictly outdoor
    const isOutdoor = type === SensorType.WIND_OUTDOOR || type === SensorType.TARMAC_TEMP;
    const targetZones = isOutdoor ? outdoorZones : indoorZones;

    for (let i = 1; i <= 5; i++) {
      // Distribute evenly among available valid zones for this type
      const zone = targetZones[i % targetZones.length];

      // Calculate a slight offset so they don't stack perfectly on top of each other on the map
      const offsetX = Math.random() * 0.005 - 0.0025;
      const offsetY = Math.random() * 0.005 - 0.0025;

      sensorsData.push({
        name: `${zone.name.split(' ')[0]}-${type.replace('_', '-')}-${String(i).padStart(2, '0')}`,
        type: type,
        status: SensorStatus.ACTIVE,
        x: Number((baseX + offsetX).toFixed(5)),
        y: Number((baseY + offsetY).toFixed(5)),
        z: isOutdoor ? 0.0 : zone.floorLevel * 5.0, // Height based on floor level
        zoneId: zone.id,
        imageUrl: SENSOR_IMAGE_MAP[type] || "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=600&q=80"
      });
    }
  });

  await prisma.sensor.createMany({
    data: sensorsData,
  });

  // ==========================================
  // 3. AVIATION: PARKING STANDS (GATES)
  // ==========================================
  console.log('🛬 Constructing Parking Stands...');

  const lerp = (start: number, end: number, fraction: number) => start + (end - start) * fraction;

  const stands = [];
  let standCounter = 1;

  // Pre-calculate which indices will receive planes so we can mark them occupied
  // This array alternates: T1(0), T2(5), T3(10), T1(1), T2(6), T3(11)...
  const roundRobinStands = [0, 5, 10, 1, 6, 11, 2, 7, 12, 3, 8, 13, 4, 9, 14];
  const occupiedStandIndices = roundRobinStands.slice(0, 10); // First 10 get planes

  // 3 terminals, distribute 5 gates evenly across each terminal's line
  const terminals = [
    LONG_THANH_COORDS.TERMINALS.T1_RIGHT,
    LONG_THANH_COORDS.TERMINALS.T2_CENTER,
    LONG_THANH_COORDS.TERMINALS.T3_LEFT,
  ];

  for (let t = 0; t < terminals.length; t++) {
    const term = terminals[t];

    // Create 5 gates per terminal line
    for (let i = 0; i < 5; i++) {
      const fraction = i / 4; // Yields 0.0, 0.25, 0.5, 0.75, 1.0
      const standLat = lerp(term.start.lat, term.end.lat, fraction);
      const standLng = lerp(term.start.lng, term.end.lng, fraction);

      const stand = await prisma.parkingStand.create({
        data: {
          code: `T${t + 1}-GATE-${i + 1}`,
          isOccupied: occupiedStandIndices.includes(standCounter), // True only if a plane spawns here
          x: Number(standLng.toFixed(6)), // Prisma x = longitude
          y: Number(standLat.toFixed(6)), // Prisma y = latitude
          z: 0.0,
          zoneId: apron.id,
        },
      });
      stands.push(stand);
      standCounter++;
    }
  }

  // ==========================================
  // 4. AVIATION: FLIGHTS & STATE MACHINE
  // ==========================================
  console.log('✈️ Scheduling Flights...');

  const airlines = [
    { code: 'VJ', name: 'VietJet Air' },
    { code: 'VN', name: 'Vietnam Airlines' },
    { code: 'QH', name: 'Bamboo Airways' },
    { code: 'CX', name: 'Cathay Pacific' },
    { code: 'SQ', name: 'Singapore Airlines' },
    { code: 'EK', name: 'Emirates' },
    { code: 'NH', name: 'ANA' },
  ];

  const cities = ['HAN', 'NRT', 'HKG', 'ICN', 'SIN', 'DXB', 'BKK', 'TPE', 'LHR', 'CDG'];

  const flightsData: any[] = [];

  for (let i = 1; i <= 20; i++) {
    const airline = airlines[i % airlines.length];
    const origin = cities[i % cities.length];
    const destination = 'SGN'; // Long Thanh

    let status: FlightStatus;
    let parkingStandId = null;

    // Distribute statuses across the stands using the round-robin array
    if (i <= 5) {
      status = FlightStatus.PARKED;
      parkingStandId = stands[roundRobinStands[i - 1]].id; // Spreads across T1, T2, T3 evenly
    } else if (i <= 10) {
      status = FlightStatus.PUSHBACK;
      parkingStandId = stands[roundRobinStands[i - 1]].id; // Spreads across T1, T2, T3 evenly
    } else if (i <= 15) {
      status = FlightStatus.APPROACHING;
    } else {
      status = FlightStatus.SCHEDULED;
    }

    flightsData.push({
      flightNumber: `${airline.code}${100 + i}`,
      airline: airline.name,
      origin: origin,
      destination: destination,
      status: status,
      parkingStandId: parkingStandId,
      imageUrl: PLANE_IMAGE_MAP[airline.code] || "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=600&q=80",
      logoUrl: AIRLINE_IMAGE_MAP[airline.code] || "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=600&q=80"
    });
  }

  await prisma.flight.createMany({
    data: flightsData,
  });

  console.log(`✅ Deployed ${allZones.length} Zones.`);
  console.log(`✅ Deployed ${sensorsData.length} IoT Sensors.`);
  console.log(`✅ Constructed ${stands.length} Parking Stands.`);
  console.log(`✅ Scheduled ${flightsData.length} Flights.`);
  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
