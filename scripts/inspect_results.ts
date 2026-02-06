
import axios from 'axios';
import * as fs from 'fs';

async function inspectResults() {
    const url = 'https://racing.hkjc.com/racing/information/Chinese/Racing/LocalResults.aspx?RaceDate=2026/01/28&RaceNo=1';
    console.log(`Fetching ${url}...`);
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        fs.writeFileSync('results_dump.html', response.data);
        console.log('Saved to results_dump.html');

    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

inspectResults();
