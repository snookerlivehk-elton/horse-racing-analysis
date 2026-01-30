import { scrapeHorseProfile } from '../src/hkjcScraper';

async function main() {
    const horseId = 'HK_2023_J405';
    console.log(`Scraping profile for ${horseId}...`);
    try {
        const profile = await scrapeHorseProfile(horseId);
        console.log('Profile scraped successfully:');
        console.log('Name:', profile.name);
        console.log('Season Stakes:', profile.seasonStakes);
        console.log('Total Stakes:', profile.totalStakes);
        // console.log('Full Profile:', JSON.stringify(profile, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

main();