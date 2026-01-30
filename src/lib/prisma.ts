
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Prevent multiple instances in development
const globalForPrisma = global as unknown as { prisma: PrismaClient };

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('Error: DATABASE_URL is not defined in environment variables!');
} else {
    console.log(`Prisma connecting to database at: ${connectionString.split('@')[1] || 'unknown host'} (masked)`);
}

// Configure Postgres pool with SSL for production (Railway)
// This fixes the ECONNREFUSED error when connecting to cloud database
const pool = new Pool({ 
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

// Use Prisma adapter for Postgres
// This is required when using engineType="client" (default in some configurations or if detected)
const adapter = new PrismaPg(pool);

export const prisma = globalForPrisma.prisma || new PrismaClient({ 
    adapter,
    log: ['query', 'info', 'warn', 'error']
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
