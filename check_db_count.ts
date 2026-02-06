
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const count = await prisma.race.count();
    console.log('Total Races in DB:', count);
    
    const races = await prisma.race.findMany({
        orderBy: { date: 'desc' },
        take: 5,
        select: { date: true, venue: true, raceNo: true }
    });
    console.log('Latest 5 races:', races);

    const oldRaces = await prisma.race.findMany({
        orderBy: { date: 'asc' },
        take: 5,
        select: { date: true, venue: true, raceNo: true }
    });
    console.log('Oldest 5 races:', oldRaces);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
