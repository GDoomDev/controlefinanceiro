import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Prisma 7 exige um driver adapter explícito — o schema não carrega mais a
// `url` do datasource (ver prisma.config.ts), então a connection string é
// passada aqui, na criação do client.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalParaPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalParaPrisma.prisma = prisma;
}
