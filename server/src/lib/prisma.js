import { PrismaClient } from '@prisma/client';

// Postgres COUNT()/bigint columns come back as BigInt, which JSON.stringify
// cannot serialise. The analytics views cast counts to int, but guard anyway.
if (typeof BigInt.prototype.toJSON !== 'function') {
  // eslint-disable-next-line no-extend-native
  BigInt.prototype.toJSON = function toJSON() {
    return Number(this);
  };
}

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__fleetPrisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.__fleetPrisma = prisma;
