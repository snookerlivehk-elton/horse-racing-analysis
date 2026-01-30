
import axios from 'axios';
import * as cheerio from 'cheerio';
import prisma from '../lib/prisma';

const BASE_URL = 'https://racing.hkjc.com/zh-hk/local/info';
const PAST_REC_URL = 'https://racing.hkjc.com/zh-hk/local/information/jockeypastrec';

async function fetchHtml(url: string) {
    try {
        console.log(`Fetching: ${url}`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
                'Accept-Language': 'zh-HK,zh;q=0.9,en;q=0.8',
                'Cookie': 'agreed=true' // Sometimes needed
            },
            timeout: 20000
        });
        return response.data;
    } catch (error) {
        console.error(`Failed to fetch ${url}:`, error);
        return null;
    }
}

export async function scrapeJockeyRanking(season: 'Current' | 'Previous' = 'Current') {
    const url = `${BASE_URL}/jockey-ranking?season=${season}&view=Numbers&racecourse=ALL`;
    const html = await fetchHtml(url);
    if (!html) return [];

    // Debug: Write HTML to file
    const fs = require('fs');
    fs.writeFileSync('debug_ranking.html', html);

    const $ = cheerio.load(html);
    const jockeys: { id: string; name: string }[] = [];

    // Debug selector
    const tables = $('table');
    console.log(`Debug: Found ${tables.length} tables`);
    tables.each((i, t) => {
        console.log(`Table ${i}: Class='${$(t).attr('class')}', Rows=${$(t).find('tr').length}`);
    });

    const table = $('.table_bd');
    const rows = table.length > 0 ? table.find('tr') : $('table tr');
    console.log(`Debug: Jockey Ranking Rows found: ${rows.length}`);
    
    if (rows.length > 0) {
        console.log('Row 0 HTML:', $(rows[0]).html()?.substring(0, 100));
        if (rows.length > 1) {
             console.log('Row 1 HTML:', $(rows[1]).html()?.substring(0, 100));
        }
        console.log('Body text start:', $('body').text().replace(/\s+/g, ' ').substring(0, 200));
    }

    rows.each((i, row) => {
        const tds = $(row).find('td');
        if (tds.length < 5) return; // Skip header/empty

        // Name cell usually contains a link with JockeyId
        const nameLink = $(tds[1]).find('a');
        if (nameLink.length === 0) return;

        const href = nameLink.attr('href') || '';
        const name = nameLink.text().trim();
        
        // Extract ID from href e.g. ...?JockeyId=BH...
        const idMatch = href.match(/[?&]JockeyId=([^&]+)/i);
        const jockeyId = idMatch ? idMatch[1] : null;

        if (jockeyId && name) {
            jockeys.push({ id: jockeyId, name });

            // Extract stats
            const wins = parseInt($(tds[2]).text().trim()) || 0;
            const seconds = parseInt($(tds[3]).text().trim()) || 0;
            const thirds = parseInt($(tds[4]).text().trim()) || 0;
            const fourths = parseInt($(tds[5]).text().trim()) || 0;
            const fifths = parseInt($(tds[6]).text().trim()) || 0;
            const totalRuns = parseInt($(tds[7]).text().trim()) || 0;
            // Stakes at 8?
            
            // Upsert into PersonStats
            prisma.personStats.upsert({
                where: {
                    type_hkjcId_season: {
                        type: 'Jockey',
                        hkjcId: jockeyId,
                        season: season
                    }
                },
                update: {
                    stats: {
                        wins, seconds, thirds, fourths, fifths, totalRuns
                    },
                    name: name
                },
                create: {
                    type: 'Jockey',
                    hkjcId: jockeyId,
                    season: season,
                    name: name,
                    stats: {
                        wins, seconds, thirds, fourths, fifths, totalRuns
                    }
                }
            }).then(() => {
                // console.log(`Updated stats for Jockey ${name} (${jockeyId})`);
            }).catch(err => console.error(`Error saving jockey stats: ${err}`));
        }
    });

    console.log(`Scraped ${jockeys.length} jockeys from ranking page.`);
    return jockeys;
}

export async function scrapeTrainerRanking(season: 'Current' | 'Previous' = 'Current') {
    const url = `${BASE_URL}/trainer-ranking?season=${season}&view=Numbers&racecourse=ALL`;
    const html = await fetchHtml(url);
    if (!html) return;

    const $ = cheerio.load(html);
    
    // Debug selector
    const table = $('.table_bd'); 
    // Usually HKJC ranking has a table with class table_bd
    
    const rows = table.length > 0 ? table.find('tr') : $('table tr');
    // console.log(`Debug: Ranking Rows found: ${rows.length}`);

    rows.each((i, row) => {
        const tds = $(row).find('td');
        if (tds.length < 5) return;

        const nameLink = $(tds[1]).find('a');
        if (nameLink.length === 0) return;

        const href = nameLink.attr('href') || '';
        const name = nameLink.text().trim();
        
        const idMatch = href.match(/[?&]TrainerId=([^&]+)/i);
        const trainerId = idMatch ? idMatch[1] : null;

        if (trainerId && name) {
            const wins = parseInt($(tds[2]).text().trim()) || 0;
            const seconds = parseInt($(tds[3]).text().trim()) || 0;
            const thirds = parseInt($(tds[4]).text().trim()) || 0;
            const fourths = parseInt($(tds[5]).text().trim()) || 0;
            const fifths = parseInt($(tds[6]).text().trim()) || 0;
            const totalRuns = parseInt($(tds[7]).text().trim()) || 0;

            prisma.personStats.upsert({
                where: {
                    type_hkjcId_season: {
                        type: 'Trainer',
                        hkjcId: trainerId,
                        season: season
                    }
                },
                update: {
                    stats: {
                        wins, seconds, thirds, fourths, fifths, totalRuns
                    },
                    name: name
                },
                create: {
                    type: 'Trainer',
                    hkjcId: trainerId,
                    season: season,
                    name: name,
                    stats: {
                        wins, seconds, thirds, fourths, fifths, totalRuns
                    }
                }
            }).catch(err => console.error(`Error saving trainer stats: ${err}`));
        }
    });
    console.log(`Scraped trainer ranking page.`);
}

export async function scrapePartnershipStats(season: 'Current' | 'Previous' = 'Current') {
    console.log(`Starting Partnership Scraping for Season: ${season}`);
    
    // 1. Get List of Jockeys
    // We can use the ranking scraper to get the fresh list
    const jockeys = await scrapeJockeyRanking(season);
    
    // 2. Iterate each Jockey
    for (const jockey of jockeys) {
        await scrapeJockeyPartnership(jockey, season);
    }
    
    console.log(`Partnership scraping completed for season ${season}`);
}

export async function scrapeJockeyPartnership(jockey: { id: string, name: string }, season: 'Current' | 'Previous' = 'Current') {
    console.log(`Scraping partnership records for ${jockey.name} (${jockey.id})...`);
    
    // Need to handle pagination? 
    // HKJC usually shows all or paged. "PageNum=1" suggests paging.
    // We'll try a loop until no data found.
    
    let page = 1;
    let hasMore = true;
    const partnershipMap: Record<string, { wins: number, 2: number, 3: number, 4: number, 5: number, total: number }> = {};

    while (hasMore) {
        const url = `${PAST_REC_URL}?jockeyid=${jockey.id}&season=${season}&PageNum=${page}`;
        const html = await fetchHtml(url);
        if (!html) {
            hasMore = false;
            break;
        }

        const $ = cheerio.load(html);
        
        const table = $('.table_bd');
        console.log(`Debug: Found ${table.length} .table_bd elements`);
        
        // If not found, try generic table
        const rows = table.length > 0 ? table.find('tr') : $('table tr');
        console.log(`Debug: Found ${rows.length} rows`);

        let rowsFound = 0;

        rows.each((i, row) => {
            const tds = $(row).find('td');
            // Columns: RaceIndex, Pla, Date, RC/Track/Course, Dist, G, Class, Dr, Rtg, Trainer, Horse, Wt, ActWt, RunningPos, FinishTime, WinOdds
            // Usually Trainer is around index 9 or 10.
            // Let's check headers or infer.
            // Typical header: 場次, 名次, 日期... 練馬師(9), 馬名(10)...
            
            if (tds.length < 10) return;

            // Find Trainer Column
            // Trainer usually has a link with TrainerId
            let trainerId = null;
            // Search for trainer link in cells
            for (let k = 0; k < tds.length; k++) {
                 const link = $(tds[k]).find('a');
                 const href = link.attr('href');
                 if (href && href.includes('TrainerId=')) {
                     const match = href.match(/[?&]TrainerId=([^&]+)/i);
                     if (match) {
                         trainerId = match[1];
                         break;
                     }
                 }
            }
            
            if (!trainerId) return;

            const placeText = $(tds[1]).text().trim(); // Place is usually col 1
            let place = parseInt(placeText);
            if (isNaN(place)) {
                // Handle non-numeric places (WV, etc) -> count as run?
                // Usually we only care about runs.
                // If it's a valid run (not withdrawn), it counts.
                if (['WV', 'WX', 'WR'].includes(placeText)) return;
                place = 99; // Unplaced
            }
            
            rowsFound++;

            if (!partnershipMap[trainerId]) {
                partnershipMap[trainerId] = { wins: 0, 2: 0, 3: 0, 4: 0, 5: 0, total: 0 };
            }
            
            const stats = partnershipMap[trainerId];
            stats.total++;
            if (place === 1) stats.wins++;
            else if (place === 2) stats[2]++;
            else if (place === 3) stats[3]++;
            else if (place === 4) stats[4]++;
            else if (place === 5) stats[5]++;
        });

        if (rowsFound === 0) {
            hasMore = false;
        } else {
            // Check if there's a "Next Page" link or just increment
            // If we found rows, try next page.
            // Safety break
            if (page > 20) hasMore = false; 
            page++;
        }
        
        // Respect rate limits slightly
        await new Promise(r => setTimeout(r, 500));
    }

    // 3. Save to DB
    for (const [trainerId, stats] of Object.entries(partnershipMap)) {
        await prisma.jockeyTrainerStats.upsert({
            where: {
                jockeyId_trainerId_season: {
                    jockeyId: jockey.id,
                    trainerId: trainerId,
                    season: season
                }
            },
            update: {
                totalRuns: stats.total,
                wins: stats.wins,
                places: stats.wins + stats[2] + stats[3], // 1st+2nd+3rd
                seconds: stats[2],
                thirds: stats[3],
                fourths: stats[4],
                fifths: stats[5]
            },
            create: {
                jockeyId: jockey.id,
                trainerId: trainerId,
                season: season,
                totalRuns: stats.total,
                wins: stats.wins,
                places: stats.wins + stats[2] + stats[3],
                seconds: stats[2],
                thirds: stats[3],
                fourths: stats[4],
                fifths: stats[5]
            }
        });
    }
}
