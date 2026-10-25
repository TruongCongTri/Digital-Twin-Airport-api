/**
 * @file prisma/seed-green-airport.ts
 * @description Adds (or re-creates) only Vietnam Green Airport (VVGA) without wiping
 * the other airports. Run with: npm run db:seed:vvga
 */
import { prisma } from '../src/common/configs/prisma';
import { removeGreenAirport, seedGreenAirport } from './seeds/green-airport.seed';

async function main() {
  await removeGreenAirport();
  await seedGreenAirport();
}

main()
  .catch((e) => {
    console.error('❌ VVGA seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
