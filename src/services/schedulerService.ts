
import * as cheerio from 'cheerio';
// import fetch from 'node-fetch'; // Native fetch in Node 18+
import { fetchOddsForAllRaces } from './oddsService';
import { scrapeTodayRacecard } from '../hkjcScraper';
import { updateAllHorseProfiles } from './profileService';

interface RaceFixture {
    date: string; // YYYY-MM-DD
    venue: string; // ST or HV
}

let cachedFixtures: RaceFixture[] = [];
let lastFixtureUpdate = 0;
let lastProfileUpdateDate = '';

const FIXTURE_URL = 'https://racing.hkjc.com/zh-hk/local/information/fixture';

async function updateFixtures() {
    console.log('Updating race fixtures...');
    try {
        const response = await fetch(FIXTURE_URL);
        const html = await response.text();
        const $ = cheerio.load(html);
        
        const fixtures: RaceFixture[] = [];
        const currentYear = new Date().getFullYear();
        
        // The fixture table is usually the first one with class 'table_bd' or just the first table in content
        // Based on analysis, it's likely the first table
        $('table').first().find('tr').each((i, row) => {
            if (i === 0) return; // Skip header
            
            const cells = $(row).find('td');
            if (cells.length < 3) return;
            
            const dateStr = $(cells[0]).text().trim(); // e.g. "01/02"
            const venueStr = $(cells[2]).text().trim(); // e.g. "沙田"
            
            if (!dateStr || !venueStr) return;
            
            // Parse Date
            const [day, month] = dateStr.split('/').map(Number);
            if (!day || !month) return;
            
            // Handle year rollover (e.g. scraping in Dec for Jan race)
            // Or scraping in Jan for Dec race (unlikely for future list)
            // Simple logic: If month < currentMonth - 2, assume next year? 
            // Better: Fixture page usually lists current season. 
            // If scraped month is less than current month, it might be next year (if currently Dec).
            // But since we are looking for *future* races, if month < nowMonth, it's next year.
            
            let year = currentYear;
            const now = new Date();
            if (month < now.getMonth() + 1 && now.getMonth() > 9) {
                year = currentYear + 1;
            }
            
            // Format YYYY-MM-DD
            const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // Map Venue
            let venue = 'ST';
            if (venueStr.includes('跑馬地')) venue = 'HV';
            else if (venueStr.includes('沙田')) venue = 'ST';
            
            fixtures.push({ date: formattedDate, venue });
        });
        
        console.log(`Found ${fixtures.length} fixtures.`);
        cachedFixtures = fixtures;
        lastFixtureUpdate = Date.now();
        
    } catch (error) {
        console.error('Failed to update fixtures:', error);
    }
}

export function startScheduler() {
    console.log('Starting Scheduler Service...');
    
    // Initial update
    updateFixtures();
    
    // Update fixtures every 6 hours
    setInterval(updateFixtures, 6 * 60 * 60 * 1000);
    
    // Check for race day every 5 minutes
    setInterval(async () => {
        const today = new Date().toISOString().split('T')[0];
        
        // Find if today is a race day
        const raceDay = cachedFixtures.find(f => f.date === today);
        
        if (raceDay) {
            console.log(`Today (${today}) is a race day at ${raceDay.venue}!`);
            
            // 1. Fetch Odds
            try {
                console.log('Fetching odds...');
                await fetchOddsForAllRaces(today, raceDay.venue);
            } catch (e) {
                console.error('Error in scheduled odds fetch:', e);
            }

            // 2. Update Horse Profiles (Once per day)
            if (lastProfileUpdateDate !== today) {
                console.log(`First run of the day (${today}). Updating horse profiles...`);
                try {
                    // Fetch racecard to get horses
                    const result = await scrapeTodayRacecard(today);
                    if (result && result.races) {
                        const allHorses = result.races.flatMap(r => r.horses);
                        // Run in background (don't await strictly if we want to return from this loop, 
                        // but since it's an interval, awaiting is fine)
                        updateAllHorseProfiles(allHorses).then(() => {
                            console.log('Daily profile update finished.');
                        }).catch(e => {
                            console.error('Daily profile update failed:', e);
                        });
                        
                        lastProfileUpdateDate = today;
                    }
                } catch (e) {
                    console.error('Error fetching racecard for profile update:', e);
                }
            }
        } else {
            // Optional: Log heartbeat
            // console.log(`Today (${today}) is not a race day.`);
        }
        
    }, 5 * 60 * 1000); // 5 minutes
}
