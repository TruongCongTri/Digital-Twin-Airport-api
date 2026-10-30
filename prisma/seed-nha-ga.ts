/**
 * @file prisma/seed-nha-ga.ts
 * @description Adds (or re-creates) only the Nha Ga site (VVNG) without wiping the other
 * airports. Run with: npm run db:seed:vvng
 */
import { prisma } from '../src/common/configs/prisma';
import { NHA_GA_COORDS } from '../src/constants/nha-ga-coordinates';
import { removeAirportByCode } from './seeds/green-airport.seed';
import { seedNhaGa } from './seeds/nha-ga.seed';

async function main() {
  await removeAirportByCode(NHA_GA_COORDS.CODE);
  await seedNhaGa();
}

main()
  .catch((e) => {
    console.error('❌ VVNG seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
