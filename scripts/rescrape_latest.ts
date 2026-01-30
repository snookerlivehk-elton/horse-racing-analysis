
import 'dotenv/config';
import { scrapeTodayRacecard } from '../src/hkjcScraper';
import { saveScrapeResultToDb } from '../src/services/dbService';
import prisma from '../src/lib/prisma';

async function main() {
    console.log('Starting re-scrape of latest racecard...');
    try {
        const result = await scrapeTodayRacecard();
        console.log(`Scraped ${result.races.length} races.`);
        
        if (result.races.length > 0) {
            // Check first horse of first race for new fields
            const firstHorse = result.races[0].horses[0];
            console.log('Sample Horse Data:', {
                name: firstHorse.name,
                draw: firstHorse.draw,
                weight: firstHorse.weight,
                ratingChange: firstHorse.ratingChange,
                gear: firstHorse.gear
            });

            const saveResult = await saveScrapeResultToDb(result);
            console.log('Save Result:', saveResult);
        } else {
            console.log('No races found.');
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
