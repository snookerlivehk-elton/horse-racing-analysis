
import axios from 'axios';
import * as fs from 'fs';

async function inspectPastRace() {
    // 2026/01/28 is a confirmed race day
    const url = 'https://racing.hkjc.com/zh-hk/local/information/racecard?racedate=2026/01/28&RaceNo=1';
    console.log(`Fetching ${url}...`);
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            maxRedirects: 5,
            validateStatus: () => true
        });
        
        console.log(`Status: ${response.status}`);
        console.log(`Final URL: ${response.request.res.responseUrl}`); // Check for redirect
        
        fs.writeFileSync('past_race_dump.html', response.data);
        console.log('Saved to past_race_dump.html');

    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

inspectPastRace();
