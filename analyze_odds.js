
const fs = require('fs');
const path = require('path');

async function analyzePage() {
    const url = 'https://bet.hkjc.com/ch/racing/wp/2026-02-01/ST/1';
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const html = await response.text();
        
        console.log(`Status: ${response.status}`);
        console.log(`Content Length: ${html.length}`);
        
        // Check for specific keywords related to odds
        const keywords = ['獨贏', '位置', 'Win', 'Place', 'odds', 'wp'];
        keywords.forEach(kw => {
            const count = (html.match(new RegExp(kw, 'gi')) || []).length;
            console.log(`Keyword '${kw}': found ${count} times`);
        });

        // Extract script src
        const scriptRegex = /<script[^>]+src="([^">]+)"/g;
        let match;
        console.log('Scripts found:');
        while ((match = scriptRegex.exec(html)) !== null) {
            console.log(match[1]);
        }

        // Save to file for manual inspection if needed (though I'll rely on grep/search mostly)
        fs.writeFileSync('hkjc_odds_dump.html', html);
        console.log('Saved HTML to hkjc_odds_dump.html');

    } catch (error) {
        console.error('Error fetching page:', error);
    }
}

analyzePage();
