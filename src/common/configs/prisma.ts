/**
 * @file prisma.ts
 * @description Prisma Client initialization and configuration.
 * Configures the PostgreSQL adapter and sets up logging levels based on the environment.
 */
import { PrismaClient } from '../../generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { env } from './env';
import { APP_CONFIG } from '@/constants/app.constant';

/**
 * 1. Database Connection Pool
 * Configures the 'pg' pool to manage multiple database connections efficiently.
 */
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

/**
 * 2. Prisma Adapter
 * Wraps the 'pg' pool in a Prisma-compatible adapter for PostgreSQL.
 */
const adapter = new PrismaPg(pool as any);

/**
 * 3. Prisma Client Instance
 * @exports prisma
 * @description The primary database client used across the application.
 * In development, it logs queries for easier debugging.
 */

const logLevels =
  process.env.NODE_ENV === APP_CONFIG.ENV.DEVELOPMENT
    ? APP_CONFIG.PRISMA.LOG_LEVELS.DEV
    : APP_CONFIG.PRISMA.LOG_LEVELS.PROD;

export const prisma = new PrismaClient({
  adapter,
  log: logLevels as any,
});
