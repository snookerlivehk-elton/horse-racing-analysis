
import cron from 'node-cron';
import { FixtureService, RaceFixture } from './fixtureService';
// import { scrapeTodayRacecard } from '../hkjcScraper'; // Removed: Pure J18 API approach
// import { saveScrapeResultToDb } from './dbService';   // Removed: Pure J18 API approach
// import { fetchOddsForAllRaces } from './oddsService'; // Removed: Pure J18 API approach
import { scrapeAndSaveJ18Like, scrapeAndSaveJ18Trend, scrapeAndSaveJ18Payout } from './j18Service';
import { processMissingSectionals } from './sectionalScraper';

import { SpeedProScraper } from './speedProScraper';

const fixtureService = new FixtureService();
const speedProScraper = new SpeedProScraper();

// Cache fixtures to avoid spamming HKJC
let fixtureCache: { monthKey: string, fixtures: RaceFixture[] } | null = null;

async function getCachedFixtures(year: number, month: number): Promise<RaceFixture[]> {
    const key = `${year}-${month}`;
    if (!fixtureCache || fixtureCache.monthKey !== key) {
        const fixtures = await fixtureService.getRaceFixtures(year, month);
        fixtureCache = { monthKey: key, fixtures };
    }
    return fixtureCache.fixtures;
}

export function startScheduler() {
    console.log('Starting Scheduler Service (Node-Cron)...');
    console.log('Mode: Manual/Backfill Only (Automatic Sync Disabled)');

    // Automatic scheduling disabled per user request
    /*
    // 1. Daily Race Check at 08:00 AM (HKT)
    cron.schedule('0 8 * * *', async () => {
        console.log('[Scheduler] Running Daily Race Check...');
        await checkAndFetchJ18();
    }, {
        timezone: "Asia/Hong_Kong"
    });

    // 2. Race Day Odds/Trend Update (Every 15 mins from 10:00 to 23:00 HKT)
    cron.schedule('*\/15 10-23 * * *', async () => {
         const fixture = await getTodayFixture();
         if (fixture) {
             console.log(`[Scheduler] It is race day (${fixture.date} @ ${fixture.venue}). Fetching J18 Data...`);
             try {
                 // Fetch latest trends and payouts from J18 API
                 // These functions will auto-create races if they don't exist
                 const dateIso = fixture.date.replace(/\//g, '-');
                 await scrapeAndSaveJ18Trend(dateIso, fixture.venue);
                 await scrapeAndSaveJ18Payout(dateIso, fixture.venue);
             } catch (e: any) {
                 console.error('[Scheduler] Error fetching J18 data:', e.message);
             }
         }
    }, {
        timezone: "Asia/Hong_Kong"
    });

    // 3. Post-Race Final Sync at 23:30 PM (HKT)
    cron.schedule('30 23 * * *', async () => {
        console.log('[Scheduler] Running Post-Race Final Sync...');
        
        const fixture = await getTodayFixture();
        if (fixture) {
            await checkAndFetchJ18();
        }
    }, {
        timezone: "Asia/Hong_Kong"
    });
    
    // 4. Daily SpeedPro Scraping at 15:05 PM (HKT)
    // Runs daily to catch "day before race" updates (usually released around 15:00)
    cron.schedule('5 15 * * *', async () => {
        console.log('[Scheduler] Running Daily SpeedPro Scraping...');
        try {
            await speedProScraper.scrapeAll();
        } catch (e: any) {
            console.error('[Scheduler] SpeedPro Scraping failed:', e.message);
        }
    }, {
        timezone: "Asia/Hong_Kong"
    });
    */
    
    console.log('[Scheduler] Automatic tasks are currently disabled (Manual Mode).');
}

async function getTodayFixture(): Promise<RaceFixture | undefined> {
    const today = new Date();
    const hkDate = new Date(today.toLocaleString("en-US", { timeZone: "Asia/Hong_Kong" }));
    
    const y = hkDate.getFullYear();
    const m = hkDate.getMonth() + 1;
    const d = hkDate.getDate();
    const todayStr = `${y}/${m.toString().padStart(2, '0')}/${d.toString().padStart(2, '0')}`;
    
    const fixtures = await getCachedFixtures(y, m);
    return fixtures.find(f => f.date === todayStr);
}

async function isTodayRaceDay(): Promise<boolean> {
    return !!(await getTodayFixture());
}


async function checkAndFetchJ18() {
    try {
        const today = new Date();
        const hkDate = new Date(today.toLocaleString("en-US", { timeZone: "Asia/Hong_Kong" }));
        
        const y = hkDate.getFullYear();
        const m = hkDate.getMonth() + 1;
        const d = hkDate.getDate();
        const todayStr = `${y}/${m.toString().padStart(2, '0')}/${d.toString().padStart(2, '0')}`;
        
        // 1. Get Fixtures
        const fixtures = await getCachedFixtures(y, m);
        const todayFixture = fixtures.find(f => f.date === todayStr);
        
        if (todayFixture) {
            console.log(`[Scheduler] Today (${todayStr}) is a RACE DAY (${todayFixture.venue})! Fetching J18 Data...`);
            
            const dateIso = todayStr.replace(/\//g, '-');
            
            // Fetch all J18 Data Types
            // Note: Trend/Like/Payout will auto-create the race in DB
            await scrapeAndSaveJ18Like(dateIso, todayFixture.venue);
            await scrapeAndSaveJ18Trend(dateIso, todayFixture.venue);
            await scrapeAndSaveJ18Payout(dateIso, todayFixture.venue);
            
            console.log('[Scheduler] J18 Data Sync completed.');
        } else {
            console.log(`[Scheduler] Today (${todayStr}) is NOT a race day. Skipping.`);
        }
    } catch (error: any) {
        console.error('[Scheduler] Error in checkAndFetchJ18:', error.message);
    }
}
