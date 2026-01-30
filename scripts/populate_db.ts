
import 'dotenv/config';
import { scrapeTodayRacecard } from '../src/hkjcScraper';
import { saveScrapeResultToDb } from '../src/services/dbService';
import prisma from '../src/lib/prisma';

async function main() {
    try {
        console.log("Starting manual scrape for 2026/02/01...");
        // Use the date user mentioned
        const result = await scrapeTodayRacecard('2026/02/01');
        
        console.log(`Scraped Date: ${result.raceDate}`);
        console.log(`Races Found: ${result.races.length}`);
        
        result.races.forEach(r => {
            console.log(`- Race ${r.raceNumber}: ${r.venue} (${r.horses.length} horses)`);
        });

        if (result.races.length > 0) {
            console.log("Saving to DB...");
            const dbRes = await saveScrapeResultToDb(result);
            console.log(`Saved: ${dbRes.savedCount}, Errors: ${dbRes.errors.length}`);
            if (dbRes.errors.length > 0) {
                console.log("Errors:", dbRes.errors);
            }
        } else {
            console.log("No races to save.");
        }

    } catch (e) {
        console.error("Scrape failed:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
