
import 'dotenv/config';
import { SpeedProScraper } from '../src/services/speedProScraper';
import prisma from '../src/lib/prisma';

async function main() {
    const scraper = new SpeedProScraper();
    await scraper.scrapeAll();
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
