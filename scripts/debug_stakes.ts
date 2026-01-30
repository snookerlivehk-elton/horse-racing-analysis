
import axios from 'axios';
import * as cheerio from 'cheerio';

async function main() {
    const horseId = 'HK_2023_J405';
    const url = `https://racing.hkjc.com/zh-hk/local/information/horse?horseId=${horseId}`;
    console.log(`Fetching ${url}...`);

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
                'Accept-Language': 'zh-HK,zh;q=0.9,en;q=0.8'
            }
        });
        const html = response.data;
        const $ = cheerio.load(html);

        console.log('Searching for stakes info...');
        
        $('td, th').each((i, el) => {
            const text = $(el).text().trim();
            if (text.includes('獎金')) {
                console.log('--- Found Element ---');
                console.log(`Text: "${text}"`);
                console.log(`Next Text: "${$(el).next().text().trim()}"`);
                console.log(`Next Next Text: "${$(el).next().next().text().trim()}"`);
                
                // Simulate scraper logic
                let nextEl = $(el).next();
                let rawNext = nextEl.text().trim();
                let val = '';
                if (rawNext === ':') {
                    val = nextEl.next().text().trim();
                } else if (rawNext.startsWith(':')) {
                    val = rawNext.substring(1).trim();
                }
                console.log(`Extracted Value: "${val}"`);
            }
        });

    } catch (e) {
        console.error(e);
    }
}

main();
