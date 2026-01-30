import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'https://racing.hkjc.com/zh-hk/racing/information/results';

function parseDateToUrlFormat(dateStr: string): string {
    // Input: dd/mm/yy (e.g. 01/02/26) or dd/mm/yyyy
    if (!dateStr) return '';
    const parts = dateStr.split('/');
    if (parts.length !== 3) return '';
    
    let [d, m, y] = parts;
    if (y.length === 2) {
        y = '20' + y;
    }
    return `${y}/${m}/${d}`;
}

async function fetchHtml(url: string) {
    try {
        console.log(`Fetching: ${url}`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
                'Accept-Language': 'zh-HK,zh;q=0.9,en;q=0.8'
            },
            timeout: 15000
        });
        return response.data;
    } catch (error) {
        console.error(`Failed to fetch ${url}:`, error);
        return null;
    }
}

// Maps Global Race Index (e.g. "393") to Race No (e.g. 1)
async function scrapeMeetingRaceMap(dateUrlPart: string): Promise<Record<string, number>> {
    const url = `${BASE_URL}/${dateUrlPart}`;
    const html = await fetchHtml(url);
    if (!html) return {};

    const $ = cheerio.load(html);
    const map: Record<string, number> = {};

    // Look for the race navigation bar
    // Usually <div class="raceNum clearfix"> ... </div>
    // Links like: <a href="...">1(393)</a>
    
    // Check all links that might contain this pattern
    $('a').each((i, el) => {
        const text = $(el).text().trim(); // "1(393)"
        const match = text.match(/^(\d+)\s*\((\d+)\)$/);
        if (match) {
            const raceNo = parseInt(match[1]);
            const globalIndex = match[2];
            map[globalIndex] = raceNo;
        }
    });

    console.log(`Mapped races for ${dateUrlPart}:`, map);
    return map;
}

export async function scrapeRaceSectionalTimes(dateStr: string, raceNo: number): Promise<Record<string, any[]>> {
    const dateUrlPart = parseDateToUrlFormat(dateStr);
    if (!dateUrlPart) return {};

    let url = `${BASE_URL}/${dateUrlPart}/${raceNo}`;
    let html = await fetchHtml(url);
    if (!html) return {};

    let $ = cheerio.load(html);
    let sectionals: Record<string, any[]> = {};

    // Check if Sectional Table exists on this page
    // Strategy: Look for "分段時間" table headers
    let sectionalTable = null;
    
    const findTable = () => {
        $('table').each((i, table) => {
            const text = $(table).text();
            if (text.includes('分段時間') && text.includes('馬號')) {
                sectionalTable = $(table);
                return false;
            }
        });
    };

    findTable();

    // If not found, look for "分段時間" link
    if (!sectionalTable) {
        const sectionalLink = $('a').filter((i, el) => $(el).text().trim() === '分段時間').first();
        if (sectionalLink.length > 0) {
            let href = sectionalLink.attr('href');
            if (href) {
                if (!href.startsWith('http')) {
                    href = `https://racing.hkjc.com${href}`;
                }
                console.log(`Following Sectional Time link: ${href}`);
                html = await fetchHtml(href);
                if (html) {
                    $ = cheerio.load(html);
                    findTable();
                }
            }
        }
    }

    if (!sectionalTable) {
        console.warn(`No Sectional Time table found for ${dateStr} Race ${raceNo}`);
        return {};
    }

    // Parse Sectional Table
    // Headers usually: 馬號, 馬名, 分段1, 分段2..., 終點時間
    // Note: The structure varies by distance.
    // We will extract all time-like strings from the row.
    
    $(sectionalTable).find('tr').each((i, tr) => {
        // Skip likely header rows (checking if first cell is a number)
        const tds = $(tr).find('td');
        if (tds.length < 3) return;

        const horseNoStr = $(tds[0]).text().trim();
        const horseName = $(tds[1]).text().trim(); // Horse Name is usually col 1
        const horseNo = parseInt(horseNoStr);
        if (isNaN(horseNo)) return; // Header or invalid row

        // Strategy: Iterate cells starting from index 2 (after No and Name)
        // Collect valid time strings (e.g. "13.22", "1.09.22")
        const times: string[] = [];
        
        // Sometimes the table has "Running Position" mixed in.
        // We only want times.
        // Times usually contain "." or ":"
        
        for (let j = 2; j < tds.length; j++) {
            const txt = $(tds[j]).text().trim();
            // Simple validation: looks like a time
            if (/^[\d.:]+$/.test(txt)) {
                times.push(txt);
            }
        }
        
        if (times.length > 0) {
            // Map by Name (removing brand no if present e.g. "Name (Brand)")
            // Usually just Name in HKJC Chinese site results
            const cleanName = horseName.split('(')[0].trim();
            sectionals[cleanName] = times;
        }
    });

    return sectionals;
}

export async function processMissingSectionals() {
    console.log('Starting Missing Sectionals Processing...');
    
    // 1. Find pending records
    // We only care about records that have a valid `raceIndex` (Global ID) and `date`
    const performances = await prisma.racePerformance.findMany({
        where: {
            sectionalTimes: { equals: Prisma.DbNull },
            date: { not: null },
            raceIndex: { not: null }
        },
        include: {
            horse: true
        },
        orderBy: { date: 'desc' },
        take: 200 // Batch size
    });

    console.log(`Found ${performances.length} records missing sectional times.`);
    if (performances.length === 0) return;

    // 2. Group by Date
    const byDate: Record<string, typeof performances> = {};
    for (const p of performances) {
        if (!p.date) continue;
        if (!byDate[p.date]) byDate[p.date] = [];
        byDate[p.date].push(p);
    }

    // 3. Process each Date
    for (const dateStr of Object.keys(byDate)) {
        console.log(`Processing Date: ${dateStr}`);
        const dateUrlPart = parseDateToUrlFormat(dateStr);
        
        // Get Race Map (GlobalIndex -> RaceNo)
        const raceMap = await scrapeMeetingRaceMap(dateUrlPart);
        
        // Group by Race within this Date
        const byRace: Record<string, typeof performances> = {};
        for (const p of byDate[dateStr]) {
            if (p.raceIndex) {
                if (!byRace[p.raceIndex]) byRace[p.raceIndex] = [];
                byRace[p.raceIndex].push(p);
            }
        }

        // Process each Race
        for (const globalIndex of Object.keys(byRace)) {
            const raceNo = raceMap[globalIndex];
            if (!raceNo) {
                console.warn(`Could not find Race No for Global Index ${globalIndex} on ${dateStr}`);
                continue;
            }

            console.log(`Scraping Race ${raceNo} (Global ${globalIndex})...`);
            const sectionals = await scrapeRaceSectionalTimes(dateStr, raceNo);
            
            // Update DB
            const perfs = byRace[globalIndex];
            for (const p of perfs) {
                const horseName = p.horse.name;
                if (sectionals[horseName]) {
                    console.log(`Updating sectionals for ${horseName} (Race ${globalIndex})`);
                    await prisma.racePerformance.update({
                        where: { id: p.id },
                        data: {
                            sectionalTimes: sectionals[horseName]
                        }
                    });
                } else {
                    // console.warn(`No sectionals found for ${horseName} in scraped data.`);
                }
            }
        }
    }
}
