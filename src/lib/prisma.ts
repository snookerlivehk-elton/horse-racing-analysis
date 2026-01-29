import { PrismaClient } from '@prisma/client';

// Prevent multiple instances in development
const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Use standard Prisma Client without adapter for better compatibility
// Prisma native engine handles SSL and connection strings automatically
export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
