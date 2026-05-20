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
  const terminal1 = await prisma.zone.create({
    data: {
      name: 'T1 - Domestic Check-in',
      type: ZoneType.CHECK_IN,
      floorLevel: 1,
      maxCapacity: 2000,
    },
  });

  const apron = await prisma.zone.create({
    data: { 
      name: 'Apron - Main Tarmac', 
      type: ZoneType.APRON, 
      floorLevel: 0, 
      maxCapacity: 50 
    },
  });

  
  const securityGate = await prisma.zone.create({
    data: {
      name: 'T1 - Main Security Screening',
      type: ZoneType.SECURITY_GATE,
      floorLevel: 1,
      maxCapacity: 500,
    },
  });

  console.log('📡 Deploying Sensors...');
  // Consolidated all sensors into a single array with correct Long Thanh coordinates
  const sensorsData = [
    // Terminal 1 Indoor Sensors
    {
      name: 'T1-CO2-01',
      type: SensorType.CO2,
      status: SensorStatus.ACTIVE,
      x: 106.1234,
      y: 20.5678,
      z: 5.0, // Mock ArcGIS Coordinates
      zoneId: terminal1.id,
    },
    {
      name: 'T1-TEMP-01',
      type: SensorType.TEMPERATURE,
      status: SensorStatus.ACTIVE,
      x: 106.1245,
      y: 20.5689,
      z: 5.0,
      zoneId: terminal1.id,
    },

    // Security Gate Sensors (High traffic risk area)
    {
      name: 'SEC-CO2-01',
      type: SensorType.CO2,
      status: SensorStatus.ACTIVE,
      x: 106.13,
      y: 20.57,
      z: 5.0,
      zoneId: securityGate.id,
    },

    // Apron / Tarmac Outdoor Sensors
    {
      name: 'APRON-WIND-01',
      type: SensorType.WIND_OUTDOOR,
      status: SensorStatus.ACTIVE,
      x: 106.15,
      y: 20.6,
      z: 15.0, // Mounted on a pole
      zoneId: apron.id,
    },
    {
      name: 'APRON-TARMAC-TEMP-01',
      type: SensorType.TARMAC_TEMP,
      status: SensorStatus.ACTIVE,
      x: 106.151,
      y: 20.601,
      z: 0.0, // Embedded in asphalt
      zoneId: apron.id,
    },
  ];

  await prisma.sensor.createMany({
    data: sensorsData,
  });

  // ==========================================
  // 2. AVIATION: PARKING STANDS (GATES)
  // ==========================================
  console.log('🛬 Constructing Parking Stands...');
  const gateV1 = await prisma.parkingStand.create({
    data: { 
      code: 'GATE-V1', 
      isOccupied: true,
      x: 106.9641, 
      y: 10.7621, 
      z: 0.0,
      zoneId: apron.id // Link to the Apron zone
    } 
  });
  
  const gateV2 = await prisma.parkingStand.create({
    data: { 
      code: 'GATE-V2', 
      isOccupied: false,
      x: 106.9643, 
      y: 10.7623, 
      z: 0.0,
      zoneId: apron.id 
    } 
  });
  
  // Remote Stand A1 (Currently not in use by any flight - perfect for testing Allocation UI!)
  const standA1 = await prisma.parkingStand.create({
    data: { 
      code: 'STAND-A1', 
      isOccupied: false,
      x: 106.9660, // Further out on the tarmac
      y: 10.7640, 
      z: 0.0,
      zoneId: apron.id 
    } 
  });

  // ==========================================
  // 3. AVIATION: FLIGHTS & STATE MACHINE
  // ==========================================
  console.log('✈️ Scheduling Flights...');
  
  // A. The "Parked" Plane (Occupying Gate V1)
  await prisma.flight.create({
    data: {
      flightNumber: 'VJ123',
      airline: 'VietJet Air',
      origin: 'HAN', // Hanoi
      destination: 'SGN', // Long Thanh (simulated as SGN replacement here)
      status: FlightStatus.PARKED,
      parkingStandId: gateV1.id,
    },
  });

  // B. The "Approaching" Plane (Will be picked up by Simulation Engine)
  await prisma.flight.create({
    data: {
      flightNumber: 'VN456',
      airline: 'Vietnam Airlines',
      origin: 'NRT', // Tokyo Narita
      destination: 'SGN',
      status: FlightStatus.APPROACHING,
      // No gate assigned yet, Dispatcher must do this in UI!
    },
  });

  // C. The "Taxiing" Plane (Just landed, heading to Gate V2)
  await prisma.flight.create({
    data: {
      flightNumber: 'CX789',
      airline: 'Cathay Pacific',
      origin: 'HKG', // Hong Kong
      destination: 'SGN',
      status: FlightStatus.TAXIING,
      parkingStandId: gateV2.id, // Dispatcher already assigned it
    },
  });

  // D. The "Scheduled" Plane (Future flight)
  await prisma.flight.create({
    data: {
      flightNumber: 'QH101',
      airline: 'Bamboo Airways',
      origin: 'SGN',
      destination: 'ICN', // Seoul
      status: FlightStatus.SCHEDULED,
    },
  });

  console.log(`✅ Deployed ${sensorsData.length} IoT Sensors.`);
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
