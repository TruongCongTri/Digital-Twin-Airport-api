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
    // ==========================================
    // TERMINAL 1 (Indoor Environment & Structure)
    // ==========================================
    // 1. Air Quality
    { name: 'T1-CO2-01', type: SensorType.CO2, status: SensorStatus.ACTIVE, x: 106.9630, y: 10.7610, z: 5.0, zoneId: terminal1.id },
    // 2. HVAC Comfort (Year 2)
    { name: 'T1-TEMP-01', type: SensorType.TEMPERATURE, status: SensorStatus.ACTIVE, x: 106.9632, y: 10.7612, z: 5.0, zoneId: terminal1.id },
    // 3. Humidity (Year 2)
    { name: 'T1-HUM-01', type: SensorType.HUMIDITY, status: SensorStatus.ACTIVE, x: 106.9634, y: 10.7614, z: 5.0, zoneId: terminal1.id },
    // 4. Indoor Airflow / AC Drafts
    { name: 'T1-WIND-IN-01', type: SensorType.WIND_INDOOR, status: SensorStatus.ACTIVE, x: 106.9636, y: 10.7616, z: 6.0, zoneId: terminal1.id },
    // 5. Sun Glare / Energy Management
    { name: 'T1-LIGHT-01', type: SensorType.LIGHT_DENSITY, status: SensorStatus.ACTIVE, x: 106.9638, y: 10.7618, z: 4.0, zoneId: terminal1.id },
    // 6. Structural Integrity (Year 1) - Placed high on a structural pillar
    { name: 'T1-TILT-01', type: SensorType.TILT_STRUCTURAL, status: SensorStatus.ACTIVE, x: 106.9639, y: 10.7619, z: 15.0, zoneId: terminal1.id }, 

    // ==========================================
    // SECURITY GATE (Crowd Flow)
    // ==========================================
    // 7. AI Crowd Flow Tracking (Year 3) - Mounted on ceiling looking down
    { name: 'SEC-CAM-AI-01', type: SensorType.CAMERA_AI_CROWD, status: SensorStatus.ACTIVE, x: 106.9640, y: 10.7620, z: 8.0, zoneId: securityGate.id },

    // ==========================================
    // APRON / TARMAC (Aviation Safety)
    // ==========================================
    // 8. Outdoor Weather
    { name: 'APRON-WIND-01', type: SensorType.WIND_OUTDOOR, status: SensorStatus.ACTIVE, x: 106.9650, y: 10.7630, z: 15.0, zoneId: apron.id },
    // 9. Asphalt Heat 
    { name: 'APRON-TARMAC-TEMP-01', type: SensorType.TARMAC_TEMP, status: SensorStatus.ACTIVE, x: 106.9655, y: 10.7635, z: 0.0, zoneId: apron.id },
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
