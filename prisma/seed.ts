/**
 * @file prisma/seed.ts
 * @description Populates the database with initial Long Thanh Airport Zones and Sensors.
 */
import { ZoneType, SensorType, SensorStatus, FlightStatus } from '../src/generated/client';
import { prisma } from '../src/common/configs/prisma';

async function main() {
  console.log('🌱 Starting Long Thanh Digital Twin database seed...');

  // ==========================================
  // 1. INFRASTRUCTURE: ZONES & SENSORS
  // ==========================================
  console.log('🚧 Building Terminal Infrastructure...');
  
  const t1CheckIn = await prisma.zone.create({
    data: { name: 'T1 - Domestic Check-in', type: ZoneType.CHECK_IN, floorLevel: 1, maxCapacity: 2000 },
  });
  const t1Security = await prisma.zone.create({
    data: { name: 'T1 - Main Security Screening', type: ZoneType.SECURITY_GATE, floorLevel: 1, maxCapacity: 500 },
  });
  const t2CheckIn = await prisma.zone.create({
    data: { name: 'T2 - International Check-in', type: ZoneType.CHECK_IN, floorLevel: 2, maxCapacity: 2500 },
  });
  const t2Security = await prisma.zone.create({
    data: { name: 'T2 - Int Security Screening', type: ZoneType.SECURITY_GATE, floorLevel: 2, maxCapacity: 600 },
  });
  const apron = await prisma.zone.create({
    data: { name: 'Apron - Main Tarmac', type: ZoneType.APRON, floorLevel: 0, maxCapacity: 50 },
  });

  const indoorZones = [t1CheckIn, t1Security, t2CheckIn, t2Security];
  const outdoorZones = [apron];
  const allZones = [...indoorZones, ...outdoorZones];

  // ==========================================
  // 2. IOT SENSORS (5 of each type)
  // ==========================================

  console.log('📡 Deploying Sensors...');

  const sensorTypes = Object.values(SensorType);
  const sensorsData: any[] = [];

  const baseX = 107.01369432683721;
  const baseY = 10.750010815599236;
  // 10.750010815599236, 107.01369432683721
  sensorTypes.forEach((type) => {
    // Determine if this sensor type is strictly outdoor
    const isOutdoor = type === SensorType.WIND_OUTDOOR || type === SensorType.TARMAC_TEMP;
    const targetZones = isOutdoor ? outdoorZones : indoorZones;

    for (let i = 1; i <= 5; i++) {
      // Distribute evenly among available valid zones for this type
      const zone = targetZones[i % targetZones.length];
      
      // Calculate a slight offset so they don't stack perfectly on top of each other on the map
      const offsetX = (Math.random() * 0.005) - 0.0025;
      const offsetY = (Math.random() * 0.005) - 0.0025;

      sensorsData.push({
        name: `${zone.name.split(' ')[0]}-${type.replace('_', '-')}-${String(i).padStart(2, '0')}`,
        type: type,
        status: SensorStatus.ACTIVE,
        x: Number((baseX + offsetX).toFixed(5)),
        y: Number((baseY + offsetY).toFixed(5)),
        z: isOutdoor ? 0.0 : zone.floorLevel * 5.0, // Height based on floor level
        zoneId: zone.id,
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
  
  const stands = [];
  for (let i = 1; i <= 10; i++) {
    const stand = await prisma.parkingStand.create({
      data: {
        code: `GATE-${i}`,
        isOccupied: i <= 5, // First 5 gates will be occupied by parked planes
        x: Number((baseX + 0.001 * i).toFixed(5)),
        y: Number((baseY + 0.001 * i).toFixed(5)),
        z: 0.0,
        zoneId: apron.id
      }
    });
    stands.push(stand);
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
    { code: 'NH', name: 'ANA' }
  ];

  const cities = ['HAN', 'NRT', 'HKG', 'ICN', 'SIN', 'DXB', 'BKK', 'TPE', 'LHR', 'CDG'];
  
  const flightsData: any[] = [];

  for (let i = 1; i <= 20; i++) {
    const airline = airlines[i % airlines.length];
    const origin = cities[i % cities.length];
    const destination = 'SGN'; // Long Thanh

    let status: FlightStatus = FlightStatus.SCHEDULED;
    let parkingStandId = null;

    // Distribute statuses: 5 Parked, 5 Taxiing, 5 Approaching, 5 Scheduled
    if (i <= 5) {
      status = FlightStatus.PARKED;
      parkingStandId = stands[i - 1].id; // Assign to GATE-1 through GATE-5
    } else if (i <= 10) {
      status = FlightStatus.TAXIING;
      parkingStandId = stands[i - 1].id; // Assigned to GATE-6 through GATE-10, heading there now
    } else if (i <= 15) {
      status = FlightStatus.APPROACHING;
    }

    flightsData.push({
      flightNumber: `${airline.code}${100 + i}`,
      airline: airline.name,
      origin: origin,
      destination: destination,
      status: status,
      parkingStandId: parkingStandId,
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
