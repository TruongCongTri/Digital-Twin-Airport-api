/**
 * @file prisma/seed.ts
 * @description Populates the database with initial Long Thanh Airport Zones and Sensors.
 */
import { ZoneType, SensorType, SensorStatus } from '../src/generated/client';
import { prisma } from '../src/common/configs/prisma';

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Create Airport Zones
  const terminal1 = await prisma.zone.create({
    data: {
      name: 'T1 - Domestic Check-in',
      type: ZoneType.CHECK_IN,
      floorLevel: 1,
      maxCapacity: 2000,
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

  const apron = await prisma.zone.create({
    data: {
      name: 'Apron - Parking Stand V1 to V5',
      type: ZoneType.APRON,
      floorLevel: 0,
      maxCapacity: 50,
    },
  });

  console.log('✅ Zones created successfully.');

  // 2. Deploy Sensors into Zones
  const sensorsData = [
    // Terminal 1 Indoor Sensors
    {
      name: 'T1-CO2-01',
      type: SensorType.CO2,
      status: SensorStatus.ACTIVE,
      x: 106.1234, y: 20.5678, z: 5.0, // Mock ArcGIS Coordinates
      zoneId: terminal1.id,
    },
    {
      name: 'T1-TEMP-01',
      type: SensorType.TEMPERATURE,
      status: SensorStatus.ACTIVE,
      x: 106.1245, y: 20.5689, z: 5.0,
      zoneId: terminal1.id,
    },
    
    // Security Gate Sensors (High traffic risk area)
    {
      name: 'SEC-CO2-01',
      type: SensorType.CO2,
      status: SensorStatus.ACTIVE,
      x: 106.1300, y: 20.5700, z: 5.0,
      zoneId: securityGate.id,
    },

    // Apron / Tarmac Outdoor Sensors
    {
      name: 'APRON-WIND-01',
      type: SensorType.WIND_OUTDOOR,
      status: SensorStatus.ACTIVE,
      x: 106.1500, y: 20.6000, z: 15.0, // Mounted on a pole
      zoneId: apron.id,
    },
    {
      name: 'APRON-TARMAC-TEMP-01',
      type: SensorType.TARMAC_TEMP,
      status: SensorStatus.ACTIVE,
      x: 106.1510, y: 20.6010, z: 0.0, // Embedded in asphalt
      zoneId: apron.id,
    },
  ];

  await prisma.sensor.createMany({
    data: sensorsData,
  });

  console.log(`✅ Deployed ${sensorsData.length} IoT Sensors.`);
  console.log('🌱 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });