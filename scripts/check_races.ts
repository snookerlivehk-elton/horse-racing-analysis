import 'dotenv/config';
import prisma from '../src/lib/prisma';

async function main() {
    const latestRace = await prisma.race.findFirst({
        orderBy: { date: 'desc' }
    });

    if (!latestRace) {
        console.log("No races found.");
        return;
    }

    console.log(`Latest Date: ${latestRace.date}`);

    const races = await prisma.race.findMany({
        where: { date: latestRace.date },
        orderBy: { raceNo: 'asc' }
    });

    console.log(`Found ${races.length} races.`);
    races.forEach(r => {
        console.log(`- Race ${r.raceNo}: ${r.venue} (ID: ${r.id})`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());