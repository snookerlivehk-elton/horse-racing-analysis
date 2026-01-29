
const cheerio = require('cheerio');

async function checkStatsFormat() {
    const url = 'https://racing.hkjc.com/zh-hk/local/information/racecard-statistics?RaceNo=1';
    
    try {
        console.log(`Fetching ${url}...`);
        const response = await fetch(url);
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
             console.log("Found Stats Table. Dumping '出道至今' (Lifetime) column (index 4 typically)...");
             
             // Iterate rows
             statsTable.find('tr').each((i, row) => {
                 if (i < 2) return; // skip headers
                 if (i > 10) return; // just first few rows

                 const cols = $(row).find('td').map((_, td) => $(td).text().trim().replace(/\s+/g, '')).get();
                 
                 // Column 4 is usually Lifetime
                 // 0: Name, 1: Age/Sex, 2: Weight, 3: Rating, 4: Lifetime
                 if (cols.length > 5) {
                     console.log(`Row ${i} - Horse: ${cols[0]}, Lifetime Raw: '${cols[4]}'`);
                 }
             });

        } else {
            console.log("Stats table not found");
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

checkStatsFormat();
