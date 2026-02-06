
import axios from 'axios';
import * as cheerio from 'cheerio';

export interface RaceFixture {
    date: string;
    venue: string;
}

export class FixtureService {
    private baseUrl = 'https://racing.hkjc.com/zh-hk/local/information/fixture';

    async getRaceFixtures(year: number, month: number): Promise<RaceFixture[]> {
        // HKJC uses 2-digit month in query? Usually standard params work.
        // User URL: calyear=2026&calmonth=01
        const monthStr = month.toString().padStart(2, '0');
        const url = `${this.baseUrl}?calyear=${year}&calmonth=${monthStr}`;
        
        console.log(`Fetching fixture for ${year}/${monthStr}...`);
        
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            const $ = cheerio.load(response.data);
            const fixtures: RaceFixture[] = [];

            $('td.calendar').each((i, el) => {
                const daySpan = $(el).find('span.f_fl.f_fs14');
                const dayText = daySpan.text().trim();
                
                if (!dayText) return;

                // Check for race indicators (images or race info)
                const images = $(el).find('img');
                const hasRaceImages = images.length > 0;
                const hasRaceInfo = $(el).text().includes('(');

                if (hasRaceImages || hasRaceInfo) {
                    const day = dayText.padStart(2, '0');
                    const date = `${year}/${monthStr}/${day}`;
                    
                    // Determine Venue
                    let venue = 'ST'; // Default
                    const html = $(el).html() || '';
                    if (html.includes('hv.gif') || html.includes('happy valley') || $(el).text().includes('跑馬地')) {
                        venue = 'HV';
                    }
                    
                    fixtures.push({ date, venue });
                }
            });

            console.log(`Found ${fixtures.length} race fixtures in ${year}/${monthStr}`);
            return fixtures;

        } catch (error: any) {
            console.error(`Error fetching fixture for ${year}/${monthStr}:`, error.message);
            return [];
        }
    }

    // Keep old method for backward compatibility if needed, or update it
    async getRaceDates(year: number, month: number): Promise<string[]> {
        const fixtures = await this.getRaceFixtures(year, month);
        return fixtures.map(f => f.date);
    }
}
