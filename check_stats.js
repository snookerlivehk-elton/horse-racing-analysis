
const cheerio = require('cheerio');
const fs = require('fs');

async function checkStats() {
    // Try with specific date and race number from user image
    const url = 'https://racing.hkjc.com/zh-hk/local/information/racecard-statistics?racedate=2026/01/28&RaceNo=7';
    
    try {
        console.log(`Fetching ${url}...`);
        const response = await fetch(url);
        const html = await response.text();
        
        const $ = cheerio.load(html);
        
        // Debug: Print title
        console.log("Page Title:", $('title').text().trim());
        
        // Look for table headers again
        const headers = [];
        $('table th, table td.table_header').each((i, th) => {
            headers.push($(th).text().trim().replace(/\s+/g, ' '));
        });
        
        console.log("Headers found (first 20):", headers.slice(0, 20).join(' | '));
        
        const keywords = ['出道至今', '同程', '同場同程', '騎師', '好地'];
        const found = keywords.filter(k => headers.some(h => h.includes(k)));
        console.log("Keywords found:", found);

        // Dump first few rows of the main table
        const rows = [];
        $('table').each((i, table) => {
             const tableText = $(table).text();
             if (tableText.includes('出道至今')) {
                 console.log("Found Stats Table!");
                 $(table).find('tr').each((j, tr) => {
                     if (j < 3) { // first 3 rows
                         const rowData = [];
                         $(tr).find('td').each((k, td) => {
                             rowData.push($(td).text().trim().replace(/\s+/g, ' '));
                         });
                         rows.push(rowData.join(' | '));
                     }
                 });
             }
        });
        
        console.log("Table Rows:", rows);

    } catch (e) {
        console.error("Error:", e);
    }
}

checkStats();
