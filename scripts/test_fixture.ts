
import { FixtureService } from '../src/services/fixtureService';
import { scrapeTodayRacecard } from '../src/hkjcScraper';

async function testFixture() {
    const service = new FixtureService();
    const dates = await service.getRaceDates(2026, 1);
    console.log('Jan 2026 Dates:', dates);
    
    if (dates.length > 0) {
        const testDate = dates[0]; // First race of Jan 2026
        console.log(`Testing scrape for ${testDate}...`);
        try {
            const result = await scrapeTodayRacecard(testDate);
            console.log('Scrape success!');
            console.log(`Races found: ${result.races.length}`);
            console.log('First race horses:', result.races[0].horses.length);
        } catch (e: any) {
            console.error('Scrape failed:', e.message);
        }
    }
}

testFixture();
