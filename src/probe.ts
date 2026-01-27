
import axios from 'axios';
import * as cheerio from 'cheerio';

const URL = 'https://racing.hkjc.com/zh-hk/local/information/racecard';

async function probe() {
    try {
        console.log('Fetching ' + URL);
        const res = await axios.get(URL, {
             headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
                'Accept-Language': 'zh-HK,zh;q=0.9,en;q=0.8'
            }
        });
        const $ = cheerio.load(res.data);
        
        // Try to find race navigation
        const raceLinks = $('div.race_tab, div.raceNum, table.raceNum').length;
        console.log('Race tab/div count:', raceLinks);
        
        // Print all links that look like race selection
        $('a[href*="race_no="]').each((i, el) => {
            console.log($(el).text().trim(), $(el).attr('href'));
        });

        // Check current race number
        console.log('Current Race info found:', $('div.race_info, .race_info').text().substring(0, 100));
        
        // Check horse count in this page
        const horseCount = $('table a[href*="/zh-hk/local/information/horse?horseid="]').length;
        console.log('Horses found on default page:', horseCount);

    } catch (e) {
        console.error(e);
    }
}

probe();
