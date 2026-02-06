
import 'dotenv/config'; // Load env vars
import { FixtureService } from '../src/services/fixtureService';
// import { scrapeTodayRacecard } from '../src/hkjcScraper'; // Removed per user request
// import { saveScrapeResultToDb } from '../src/services/dbService'; // Removed per user request
import { scrapeAndSaveJ18Trend, scrapeAndSaveJ18Like, scrapeAndSaveJ18Payout } from '../src/services/j18Service';
import prisma from '../src/lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

// Helper to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runBackfill() {
    const fixtureService = new FixtureService();
    
    // Configuration
    // User requested 1 year for expanded data set
    const startYear = 2026;
    const startMonth = 2; // February
    
    // Calculate cutoff date: 1 year ago from 2026-02-01 is 2025-02-01
    const cutoffDate = new Date('2025-02-01');

    console.log('Starting backfill process (API Only)...');
    console.log(`Range: From ${cutoffDate.toISOString().split('T')[0]} to ${startYear}-${startMonth}-01`);

    // We still iterate month by month, but check the date
    let iterYear = 2025;
    let iterMonth = 2; // Start from February 2025

    const targetYear = startYear;
    const targetMonth = startMonth;

    let totalProcessed = 0;
    let totalSkipped = 0;

    while (iterYear < targetYear || (iterYear === targetYear && iterMonth <= targetMonth)) {
        console.log(`Processing Month: ${iterYear}/${iterMonth}`);
        
        try {
            // Get fixtures with venue info
            const fixtures = await fixtureService.getRaceFixtures(iterYear, iterMonth);
            console.log(`Found ${fixtures.length} fixtures for ${iterYear}/${iterMonth}`);

            for (const fixture of fixtures) {
                // fixture.date is YYYY/MM/DD
                // Convert to YYYY-MM-DD for J18 and DB
                const dateIso = fixture.date.replace(/\//g, '-');
                const fixtureDate = new Date(dateIso);
                
                if (fixtureDate < cutoffDate) {
                    console.log(`Skipping ${dateIso} (Before cutoff)`);
                    totalSkipped++;
                    continue;
                }
                if (fixtureDate > new Date('2026-02-01')) {
                    console.log(`Skipping ${dateIso} (After end date)`);
                    totalSkipped++;
                    continue;
                }

                console.log(`>>> Processing Race Day: ${dateIso} (${fixture.venue})`);
                
                try {
                    // 1. Fetch J18 Data Directly (No HKJC Scraping)
                    // The service functions will auto-create "Skeleton Races" if missing
                    console.log(`Fetching J18 Data for ${dateIso}...`);
                    
                    await scrapeAndSaveJ18Trend(dateIso, fixture.venue);
                    await scrapeAndSaveJ18Like(dateIso, fixture.venue);
                    await scrapeAndSaveJ18Payout(dateIso, fixture.venue);
                    
                    console.log(`Successfully processed ${dateIso}`);
                    totalProcessed++;
                } catch (err: any) {
                    console.error(`Failed to process ${dateIso}:`, err.message);
                }

                // Reduced delay for faster backfill
                const waitTime = 500 + Math.random() * 500;
                // console.log(`Waiting ${Math.round(waitTime)}ms...`);
                await delay(waitTime);
            }

        } catch (err: any) {
            console.error(`Error processing month ${iterYear}/${iterMonth}:`, err.message);
        }

        // Increment month
        iterMonth++;
        if (iterMonth > 12) {
            iterMonth = 1;
            iterYear++;
        }
        
        // Delay between months
        await delay(1000);
    }

    console.log(`Backfill completed. Processed: ${totalProcessed}, Skipped: ${totalSkipped}`);
    await prisma.$disconnect();
}

// Execute
runBackfill().catch(console.error);
