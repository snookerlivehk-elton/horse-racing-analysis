
const cheerio = require('cheerio');

async function debugScraper() {
    const raceCardUrl = 'https://racing.hkjc.com/zh-hk/local/information/racecard?RaceNo=1';
    const statsUrl = 'https://racing.hkjc.com/zh-hk/local/information/racecard-statistics?RaceNo=1';

    console.log("=== Debugging Main Racecard ===");
    try {
        const response = await fetch(raceCardUrl);
        const html = await response.text();
        const $ = cheerio.load(html);

        // Find the main table
        const table = $('table').has('a[href*="/zh-hk/local/information/horse?horseid="]').first();
        if (table.length) {
            // Print Headers
            const headers = [];
            table.find('tr').first().find('td, th').each((i, el) => {
                headers.push(`${i}: ${$(el).text().trim()}`);
            });
            console.log("Headers:", headers.join(' | '));

            // Print First Row
            const firstRow = table.find('tr').has('a[href*="/zh-hk/local/information/horse?horseid="]').first();
            const cols = [];
            firstRow.find('td').each((i, el) => {
                cols.push(`${i}: ${$(el).text().trim()}`);
            });
            console.log("First Row:", cols.join(' | '));
        } else {
            console.log("Main table not found");
        }
    } catch (e) {
        console.error("Error fetching racecard:", e);
    }

    console.log("\n=== Debugging Stats Page ===");
    try {
        const response = await fetch(statsUrl);
        const html = await response.text();
        const $ = cheerio.load(html);

        // Find stats table
        let statsTable = null;
        $('table').each((i, tbl) => {
            if ($(tbl).text().includes('出道至今')) {
                statsTable = $(tbl);
            }
        });

        if (statsTable) {
             // Print Headers
            const headers = [];
            // Sometimes header is split in multiple rows, take the second row which usually has specific columns? 
            // Or just dump first 2 rows
            statsTable.find('tr').slice(0, 3).each((rIndex, row) => {
                 const rowCols = [];
                 $(row).find('td, th').each((i, el) => {
                     rowCols.push(`${i}: ${$(el).text().trim().replace(/\s+/g, ' ')}`);
                 });
                 console.log(`Header Row ${rIndex}:`, rowCols.join(' | '));
            });

            // Print First Data Row
            const firstDataRow = statsTable.find('tr').slice(3, 4); // Assuming data starts after headers
            const cols = [];
            firstDataRow.find('td').each((i, el) => {
                cols.push(`${i}: ${$(el).text().trim().replace(/\s+/g, ' ')}`);
            });
            console.log("First Data Row:", cols.join(' | '));

        } else {
            console.log("Stats table not found");
        }

    } catch (e) {
        console.error("Error fetching stats:", e);
    }
}

debugScraper();
