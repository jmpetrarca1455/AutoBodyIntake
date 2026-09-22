import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';

/**
 * Singleton Prisma client. Reused across the app so we don't exhaust
 * database connections during dev hot-reloads.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (config.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

