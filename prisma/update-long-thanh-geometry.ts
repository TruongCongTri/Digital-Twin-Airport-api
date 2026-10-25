/**
 * @file prisma/update-long-thanh-geometry.ts
 * @description Moves the existing Long Thanh (VVLT) sensors and parking stands onto the
 * OpenStreetMap-derived positions (src/constants/long-thanh-osm.ts) in place, so sensor ids,
 * logs and flight assignments are kept. Run with: npm run db:update:vvlt-geometry
 */
import { prisma } from '../src/common/configs/prisma';
import { LONG_THANH_COORDS } from '../src/constants/airport-coordinates';

const PIERS = [
  LONG_THANH_COORDS.TERMINALS.T1_RIGHT,
  LONG_THANH_COORDS.TERMINALS.T2_CENTER,
  LONG_THANH_COORDS.TERMINALS.T3_LEFT,
];

async function main() {
  const airport = await prisma.airport.findUnique({ where: { code: 'VVLT' } });
  if (!airport) throw new Error('VVLT airport not found');

  // Sensors: LTN-<TYPE>-<i> (indoor) and LTN-OUT-<TYPE>-<i> (outdoor)
  const sensors = await prisma.sensor.findMany({ where: { airportId: airport.id }, select: { id: true, name: true } });
  let movedSensors = 0;
  for (const s of sensors) {
    const outdoor = /^LTN-OUT-.+-(\d+)$/.exec(s.name);
    const indoor = /^LTN-(?!OUT-).+-(\d+)$/.exec(s.name);
    const anchor = outdoor
      ? LONG_THANH_COORDS.SENSOR_ANCHORS.OUTDOOR[Number(outdoor[1])]
      : indoor
        ? LONG_THANH_COORDS.SENSOR_ANCHORS.INDOOR[Number(indoor[1])]
        : undefined;
    if (!anchor) continue;
    await prisma.sensor.update({
      where: { id: s.id },
      data: { x: anchor.lng, y: anchor.lat, z: outdoor ? 0 : 5 },
    });
    movedSensors++;
  }

  // Stands: LTN-T<pier>-G<n>
  const stands = await prisma.parkingStand.findMany({
    where: { zone: { airportId: airport.id } },
    select: { id: true, code: true },
  });
  let movedStands = 0;
  for (const st of stands) {
    const m = /^LTN-T(\d)-G(\d)$/.exec(st.code);
    const point = m ? PIERS[Number(m[1]) - 1]?.stands[Number(m[2]) - 1] : undefined;
    if (!point) continue;
    await prisma.parkingStand.update({ where: { id: st.id }, data: { x: point.lng, y: point.lat } });
    movedStands++;
  }

  console.log(`✅ VVLT: moved ${movedSensors}/${sensors.length} sensors and ${movedStands}/${stands.length} stands`);
}

main()
  .catch((e) => {
    console.error('❌ VVLT geometry update failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
