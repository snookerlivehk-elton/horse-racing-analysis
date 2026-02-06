
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';

async function inspectFixture() {
    const url = 'https://racing.hkjc.com/zh-hk/local/information/fixture?calyear=2026&calmonth=01';
    console.log(`Fetching ${url}...`);
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        fs.writeFileSync('fixture_dump.html', response.data);
        console.log('Saved to fixture_dump.html');

    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

inspectFixture();
