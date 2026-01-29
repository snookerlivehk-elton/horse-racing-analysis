import axios from 'axios';
import * as cheerio from 'cheerio';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

export interface HorsePerformanceRow {
    columns: string[];
}

export interface HorsePerformanceRecord {
    horseId: string;
    horseName: string;
    rows: HorsePerformanceRow[];
}

export interface HorseStats {
    lifetime?: string;
    currentSeason?: string;
    thisClass?: string;
    thisDistance?: string;
    thisCourseDistance?: string;
    jockeyPartnership?: string;
    trackGood?: string;
    trackYielding?: string;
    trackSoft?: string;
}

export interface RaceHorseInfo {
    number: string;
    name: string;
    horseId: string;
    jockey: string;
    trainer: string;
    draw: string;
    weight: string;
    rating: string;
    age: string;
    sex: string;
    url: string;
    performance?: HorsePerformanceRecord;
    stats?: HorseStats;
}

export interface RaceInfo {
    raceNumber: number;
    horses: RaceHorseInfo[];
    class?: string;
    distance?: string;
    venue?: string;
    track?: string;
    surface?: string;
    location?: string; // "Sha Tin" or "Happy Valley"
    conditions?: string; // Full string like "Class 4 - 1200M - Turf"
}

export interface ScrapeResult {
    races: RaceInfo[];
    horses: HorsePerformanceRecord[]; // Keep flat list for backward compatibility if needed, or just derive
    scrapedAt: string;
    raceDate?: string;
}

const BASE_URL = 'https://racing.hkjc.com';
const RACECARD_URL = 'https://racing.hkjc.com/zh-hk/local/information/racecard';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function parseChineseDate(dateStr: string): string | undefined {
    // 2026年2月1日 -> 2026/02/01
    const match = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (match) {
        const y = match[1];
        const m = match[2].padStart(2, '0');
        const d = match[3].padStart(2, '0');
        return `${y}/${m}/${d}`;
    }
    return undefined;
}

function buildUrl(href: string | undefined | null): string | null {
    if (!href) return null;
    if (href.startsWith('http')) return href;
    if (href.startsWith('/')) return `${BASE_URL}${href}`;
    return `${RACECARD_URL}${href}`;
}

async function fetchHtml(url: string): Promise<string> {
    console.log(`Fetching: ${url}`);
    const response = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
            'Accept-Language': 'zh-HK,zh;q=0.9,en;q=0.8'
        },
        timeout: 15000
    });
    return response.data;
}

export interface HorseProfileRecord {
    raceIndex: string;
    rank: string;
    date: string;
    distance: string;
    venue: string;
    class: string;
    draw: string;
    jockey: string;
    trainer: string;
    rating: string;
    weight: string;
    odds: string;
}

export interface HorseProfileExtended {
    name: string;
    id: string;
    origin?: string;
    age?: string;
    color?: string;
    sex?: string;
    importType?: string;
    seasonStakes?: string;
    totalStakes?: string;
    record?: string; // W-Q-P-Total
    sire?: string;
    dam?: string;
    damSire?: string;
    owner?: string;
    trainer?: string;
    records: HorseProfileRecord[];
}

export async function scrapeHorseProfile(horseId: string): Promise<HorseProfileExtended> {
    // Clean ID if needed (e.g. HK_2023_J405 -> J405)
    let queryId = horseId;
    if (horseId.includes('_')) {
        queryId = horseId.split('_').pop() || horseId;
    }

    const url = `https://racing.hkjc.com/zh-hk/local/information/horse?horseId=${queryId}`;
    console.log(`Scraping horse profile: ${url}`);
    
    try {
        const html = await fetchHtml(url);
        const $ = cheerio.load(html);
        
        // Extract Horse Name
        // Usually in a format like "馬匹資料 - 展雄威 (J405)" or header
        // Looking for the main title or profile info
        let name = $('title').text().split('-')[1]?.trim() || horseId;
        // Or try to find it in the profile table
        const profileName = $('.profile_table td').first().text().trim();
        if (profileName) name = profileName;

        // Extract Profile Details
        const profileInfo: any = {};
        // Expanded selector to include div and span for table-less layouts
        $('td, th, div, span').each((i, el) => {
            const text = $(el).text().trim();
            
            // Optimization: Skip long text which is unlikely to be a label
            if (text.length > 30) return;

            const nextEl = $(el).next();
            const val = nextEl.text().trim();

            if (text.includes('出生地') && text.includes('馬齡')) {
                // "澳洲 / 3"
                const parts = val.split('/');
                profileInfo.origin = parts[0]?.trim();
                profileInfo.age = parts[1]?.trim();
            } else if (text.includes('毛色') && text.includes('性別')) {
                // "棗 / 閹"
                const parts = val.split('/');
                profileInfo.color = parts[0]?.trim();
                profileInfo.sex = parts[1]?.trim();
            } else if (text === '進口類別') {
                profileInfo.importType = val;
            } else if (text === '季內獎金') {
                profileInfo.seasonStakes = val;
            } else if (text === '總獎金') {
                profileInfo.totalStakes = val;
            } else if (text === '冠-亞-季-總出賽次數') {
                profileInfo.record = val;
            } else if (text === '父系') {
                profileInfo.sire = val;
            } else if (text === '母系') {
                profileInfo.dam = val;
            } else if (text === '外祖父') {
                profileInfo.damSire = val;
            } else if (text === '馬主') {
                profileInfo.owner = val;
            } else if (text === '練馬師') {
                // Note: Trainer might be in the records table too, but this is current trainer
                profileInfo.trainer = val;
            }
        });

        const records: HorseProfileRecord[] = [];

        // Find the performance table
        // It usually contains "場次" in the header
        $('table').each((i, table) => {
            const headerText = $(table).find('tr').first().text();
            if (headerText.includes('場次') && headerText.includes('名次')) {
                // This is likely the performance table
                $(table).find('tr').each((j, row) => {
                    if (j === 0) return; // Skip header

                    const cols = $(row).find('td').map((k, col) => $(col).text().trim()).get();
                    if (cols.length > 10) {
                        // Adjust index based on actual column layout
                        // Typically: 0:場次, 1:名次, 2:日期, 3:場地/跑道/賽道, 4:路程, 5:場地狀況, 6:賽事班次, 7:檔位, 8:評分, 9:練馬師, 10:騎師, 11:頭馬距離, 12:負磅, 13:獨贏賠率
                        // But let's be flexible and map based on standard expectation or check header
                        // Let's assume standard layout for now based on recent scrapes or the snippet provided
                        
                        // From web reference snippet:
                        // 場次 名次 日期 路程 場地 班次 騎師 評分 獨贏
                        // But the full table usually has more.
                        // Let's try to map commonly found indices.
                        
                        records.push({
                            raceIndex: cols[0],
                            rank: cols[1],
                            date: cols[2],
                            venue: cols[3], // This might be combined or separate
                            distance: cols[4],
                            class: cols[5],
                            draw: cols[6], // 檔位 often here
                            rating: cols[7], // or 8
                            trainer: cols[8], // varying
                            jockey: cols[9], // varying
                            weight: cols[11], // varying
                            odds: cols.length > 12 ? cols[cols.length - 1] : '-' // Odds usually last or near last
                        } as any);
                    }
                });
            }
        });

        // Refine parsing based on common HKJC layout if the above generic one is too loose
        // Standard Columns often: 
        // 0:場次 1:名次 2:日期 3:馬場/跑道/賽道 4:路程 5:場地狀況 6:賽事班次 7:檔位 8:評分 9:練馬師 10:騎師 11:頭馬距離 12:負磅 13:獨贏賠率
        // Let's re-map if we found a table
        if (records.length > 0) {
            // Re-map with specific indices for better accuracy
             $('table').each((i, table) => {
                const $table = $(table);
                if ($table.find('th, td').text().includes('場次') && $table.find('th, td').text().includes('名次')) {
                    // clear generic parse
                    records.length = 0; 
                    
                    $table.find('tr').each((j, row) => {
                        const $cols = $(row).find('td');
                        if ($cols.length < 10) return;

                        records.push({
                            raceIndex: $cols.eq(0).text().trim(),
                            rank: $cols.eq(1).text().trim(),
                            date: $cols.eq(2).text().trim(),
                            venue: $cols.eq(3).text().trim(),
                            distance: $cols.eq(4).text().trim(),
                            class: $cols.eq(6).text().trim(), // Skip condition at 5
                            draw: $cols.eq(7).text().trim(),
                            rating: $cols.eq(8).text().trim(),
                            trainer: $cols.eq(9).text().trim(),
                            jockey: $cols.eq(10).text().trim(),
                            weight: $cols.eq(12).text().trim(),
                            odds: $cols.eq(13).text().trim()
                        });
                    });
                }
            });
        }

        return { 
            name, 
            id: horseId,
            ...profileInfo,
            records 
        };

    } catch (error) {
        console.error(`Error scraping horse profile for ${horseId}:`, error);
        throw error;
    }
}

function formatJcStats(raw: string): string {
    if (!raw) return '-';
    // Remove all whitespace
    const clean = raw.replace(/\s+/g, '');
    
    // Try to match 5 numbers first: N-N-N-N-N
    // This handles "12(2-3-1-0-6)", "2-3-1-0-6", ":0-0-0-0-0" etc.
    const match5 = clean.match(/(\d+)-(\d+)-(\d+)-(\d+)-(\d+)/);
    if (match5) {
        const nums = match5.slice(1, 6).map(n => parseInt(n, 10));
        const total = nums.reduce((a, b) => a + b, 0);
        return `${total}(${nums.join('-')})`;
    }

    // Try to match 4 numbers: N-N-N-N
    const match4 = clean.match(/(\d+)-(\d+)-(\d+)-(\d+)/);
    if (match4) {
        const nums = match4.slice(1, 5).map(n => parseInt(n, 10));
        const total = nums.reduce((a, b) => a + b, 0);
        return `${total}(${nums.join('-')})`;
    }
    
    return raw;
}

function calculateStatsFromRecords(rows: HorsePerformanceRow[]): string {
    let totalRuns = 0;
    let wins = 0;
    let seconds = 0;
    let thirds = 0;
    let fourths = 0;
    let unplaced = 0;

    for (const row of rows) {
        // Assume Rank is at index 1 based on HKJC_HEADERS
        if (row.columns.length < 2) continue;
        const rankStr = row.columns[1];
        
        // Check for non-run statuses (Withdrawals)
        if (['WV', 'WX', 'WR'].includes(rankStr)) continue;

        // Parse rank
        // Handle "1 DH" etc. by taking the first integer part
        const rank = parseInt(rankStr, 10);
        
        if (!isNaN(rank)) {
            totalRuns++;
            if (rank === 1) wins++;
            else if (rank === 2) seconds++;
            else if (rank === 3) thirds++;
            else if (rank === 4) fourths++;
            else unplaced++;
        } else {
            // Handle specific non-numeric ranks that count as runs
            if (['PU', 'UR', 'FE', 'DNF', 'DISQ', 'TNP'].includes(rankStr)) {
                totalRuns++;
                unplaced++;
            }
        }
    }

    return `${totalRuns}(${wins}-${seconds}-${thirds}-${fourths}-${unplaced})`;
}

function calculateDetailedStats(
    records: HorsePerformanceRow[], 
    context: { 
        seasonStart: Date,
        seasonEnd: Date,
        class: string,
        distance: string,
        venue: string, // "草地" or "全天候"
        location: string, // "沙田" or "跑馬地"
        jockey: string
    }
): HorseStats {
    const stats = {
        lifetime: { runs: 0, w: 0, q: 0, p: 0, f: 0, u: 0 },
        currentSeason: { runs: 0, w: 0, q: 0, p: 0, f: 0, u: 0 },
        thisClass: { runs: 0, w: 0, q: 0, p: 0, f: 0, u: 0 },
        thisDistance: { runs: 0, w: 0, q: 0, p: 0, f: 0, u: 0 },
        thisCourseDistance: { runs: 0, w: 0, q: 0, p: 0, f: 0, u: 0 },
        jockeyPartnership: { runs: 0, w: 0, q: 0, p: 0, f: 0, u: 0 },
        trackGood: { runs: 0, w: 0, q: 0, p: 0, f: 0, u: 0 },
        trackYielding: { runs: 0, w: 0, q: 0, p: 0, f: 0, u: 0 },
        trackSoft: { runs: 0, w: 0, q: 0, p: 0, f: 0, u: 0 }
    };

    const addStat = (bucket: keyof typeof stats, rank: number) => {
        stats[bucket].runs++;
        if (rank === 1) stats[bucket].w++;
        else if (rank === 2) stats[bucket].q++;
        else if (rank === 3) stats[bucket].p++;
        else if (rank === 4) stats[bucket].f++;
        else stats[bucket].u++;
    };
    
    // Map class names to simple levels if needed, or string match
    // Context Class: "第四班"
    // Record Class: "4" or "4 (60-40)"
    // Need mapping
    const getSimpleClass = (c: string) => {
        if (!c) return '';
        if (c.includes('一')) return '1';
        if (c.includes('二')) return '2';
        if (c.includes('三')) return '3';
        if (c.includes('四')) return '4';
        if (c.includes('五')) return '5';
        if (c.includes('公開')) return 'Open';
        return c.replace(/\D/g, ''); // Extract number if exists
    };

    const targetClassSimple = getSimpleClass(context.class);
    const targetDistance = context.distance.replace('米', '');

    for (const row of records) {
        if (row.columns.length < 10) continue;
        const rankStr = row.columns[1];
        const dateStr = row.columns[2];
        const venueStr = row.columns[3]; // "田草A"
        const distStr = row.columns[4];
        const goingStr = row.columns[5];
        const classStr = row.columns[6];
        const jockeyStr = row.columns[10];

        // Skip withdrawals
        if (['WV', 'WX', 'WR'].includes(rankStr)) continue;

        let rank = parseInt(rankStr, 10);
        let isRun = !isNaN(rank);
        
        if (!isRun && ['PU', 'UR', 'FE', 'DNF', 'DISQ', 'TNP'].includes(rankStr)) {
            isRun = true;
            rank = 99; // Treat as unplaced
        }

        if (!isRun) continue;

        // Lifetime
        addStat('lifetime', rank);

        // Current Season
        // Parse DD/MM/YY
        const [d, m, y] = dateStr.split('/').map(Number);
        if (d && m && y) {
            // Assume 20xx
            const fullYear = 2000 + y;
            const date = new Date(fullYear, m - 1, d);
            if (date >= context.seasonStart && date <= context.seasonEnd) {
                addStat('currentSeason', rank);
            }
        }

        // This Class
        if (getSimpleClass(classStr) === targetClassSimple && targetClassSimple !== '') {
            addStat('thisClass', rank);
        }

        // This Distance
        if (distStr === targetDistance) {
            addStat('thisDistance', rank);
        }

        // This Course & Distance
        // Match logic:
        // ST Turf -> "田草"
        // HV Turf -> "谷草"
        // ST AWT -> "田泥" or "全天候"
        let isSameCourse = false;
        if (context.location === '沙田') {
            if (context.venue.includes('草')) {
                if (venueStr.includes('田草')) isSameCourse = true;
            } else if (context.venue.includes('全天候') || context.venue.includes('泥')) {
                if (venueStr.includes('田泥') || venueStr.includes('全天候')) isSameCourse = true;
            }
        } else if (context.location === '跑馬地') {
            if (context.venue.includes('草')) {
                if (venueStr.includes('谷草')) isSameCourse = true;
            }
            // HV has no AWT usually
        }

        if (isSameCourse && distStr === targetDistance) {
            addStat('thisCourseDistance', rank);
        }

        // Jockey
        // Simple includes check as names might be "P Purton" vs "Purton"
        // Or exact match if Chinese
        if (jockeyStr === context.jockey || (context.jockey && jockeyStr.includes(context.jockey))) {
            addStat('jockeyPartnership', rank);
        }

        // Track Conditions
        if (goingStr.includes('好')) addStat('trackGood', rank);
        if (goingStr.includes('黏')) addStat('trackYielding', rank);
        if (goingStr.includes('軟') || goingStr.includes('爛')) addStat('trackSoft', rank);
    }

    const fmt = (s: { runs: number, w: number, q: number, p: number, f: number, u: number }) => 
        `${s.runs}(${s.w}-${s.q}-${s.p}-${s.f}-${s.u})`;

    return {
        lifetime: fmt(stats.lifetime),
        currentSeason: fmt(stats.currentSeason),
        thisClass: fmt(stats.thisClass),
        thisDistance: fmt(stats.thisDistance),
        thisCourseDistance: fmt(stats.thisCourseDistance),
        jockeyPartnership: fmt(stats.jockeyPartnership),
        trackGood: fmt(stats.trackGood),
        trackYielding: fmt(stats.trackYielding),
        trackSoft: fmt(stats.trackSoft)
    };
}

export async function scrapeAllRaces(date?: string): Promise<{ races: RaceInfo[], raceDate: string }> {
    const races: RaceInfo[] = [];
    const maxRaces = 14; 
    let firstRaceFirstHorseId: string | null = null;
    let raceDate: string | undefined;

    for (let i = 1; i <= maxRaces; i++) {
        // Use consistent RaceNo parameter
        let url = `${RACECARD_URL}?RaceNo=${i}`;
        if (date) {
            url = `${RACECARD_URL}?racedate=${date}&RaceNo=${i}`;
        }
        
        try {
            if (i > 1) await sleep(500); // Polite delay

            const html = await fetchHtml(url);
            const $ = cheerio.load(html);
            
            // Extract Race Info (Class, Distance, Venue, etc.)
            // Look for the race meeting info block, often in ".race_meeting" or similar, or just plain text at top
            // Example: "第一場 - 第四班 - 1200米 - (60-40) - 草地 - "C+3" 賽道 - 12:45"
            // Or "Race 1 - Class 4 - 1200M - Turf"
            
            let raceConditions = '';
            // Try to find the specific info row. 
            // In HKJC racecard, it's often in a specific div or table row above the horse table.
            // Often inside <div class="rowDiv15"> or similar containing text like "Class"
            
            // Let's grab the text that contains the race info
            // Strategy: Look for text containing "班" (Class) and "米" (Metres)
            $('div, td, span').each((_, el) => {
                const text = $(el).text().trim();
                if (text.includes('班') && text.includes('米') && text.length < 100 && text.length > 10) {
                    // This is a candidate for race conditions
                    // Filter out super long text or unrelated
                    if (!raceConditions || text.length > raceConditions.length) {
                        raceConditions = text;
                    }
                }
            });

            // If found, parse it
            let raceClass = '', distance = '', venue = '', track = '', location = '';
            if (raceConditions) {
                // Example: "第一場 - 第四班 - 1200米 - (60-40) - 草地 - "C+3" 賽道"
                // Extract Class
                const classMatch = raceConditions.match(/第.+班/);
                if (classMatch) raceClass = classMatch[0];
                
                // Extract Distance
                const distMatch = raceConditions.match(/\d+米/);
                if (distMatch) distance = distMatch[0].replace('米', '');
                
                // Extract Venue/Track
                // Usually "草地" or "全天候跑道"
                if (raceConditions.includes('草地')) venue = '草地';
                else if (raceConditions.includes('全天候')) venue = '全天候跑道';
                else if (raceConditions.includes('泥地')) venue = '泥地';
                
                // Track
                const trackMatch = raceConditions.match(/"[^"]+" ?賽道/);
                if (trackMatch) track = trackMatch[0];

                // Location
                if (raceConditions.includes('沙田')) location = '沙田';
                else if (raceConditions.includes('跑馬地')) location = '跑馬地';
                // If not explicit, try to infer from track
                if (!location && track) {
                    // C+3, A, B, C usually imply Turf which can be both
                    // But if it's "全天候" it's usually ST
                }
            }

            // Try to extract race date from the first successful page
            if (!raceDate) {
                // Look for date pattern in body text or specific elements
                const bodyText = $('body').text();
                // Pattern: YYYY年M月D日
                const match = bodyText.match(/(\d{4}年\d{1,2}月\d{1,2}日)/);
                if (match) {
                    raceDate = match[1];
                    console.log(`Detected Race Date: ${raceDate}`);
                    
                    // If we are in auto-detect mode (no date provided), 
                    // use the detected date for subsequent races to ensure consistency
                    if (!date) {
                        const parsed = parseChineseDate(raceDate);
                        if (parsed) {
                            date = parsed;
                            console.log(`Auto-detected date ${date}, using for subsequent races.`);
                        }
                    }
                }
            }

            // Check if we have a valid horse table
            const horseLinks = $('table a[href*="/zh-hk/local/information/horse?horseid="]');
            if (horseLinks.length === 0) {
                console.log(`Race ${i}: No horses found, stopping.`);
                break;
            }

            const currentRaceHorses: RaceHorseInfo[] = [];
            
            // Iterate over table rows to capture structured data
            // Assuming standard HKJC racecard table structure
            // We find rows that contain a horse link
            const rows = $('table tr').has('a[href*="/zh-hk/local/information/horse?horseid="]');
            
            rows.each((_, tr) => {
                const $tr = $(tr);

                // Skip rows that contain nested tables (e.g. layout tables)
                if ($tr.find('table').length > 0) return;

                const link = $tr.find('a[href*="/zh-hk/local/information/horse?horseid="]').first();
                const href = link.attr('href') || '';
                const fullUrl = buildUrl(href);
                const match = href.match(/horseid=([^&]+)/i);
                const horseId = match ? match[1] : '';
                const name = link.text().trim();

                if (!horseId || !name || !fullUrl) return;

                // Extract other columns based on position (naive but effective for static structure)
                // Adjust indices based on observation or try to find by content
                const tds = $tr.find('td');
                // Usually: 0: Horse No, 1: Last 6 runs, 2: Color, 3: Name, 4: Brand, 5: Wt, 6: Jockey, 7: Over, 8: Draw, 9: Trainer...
                // But let's be safer: get text of all TDs and map
                const cols = tds.map((_, td) => $(td).text().trim()).get();
                
                // Heuristic mapping
                // Find column with horse name -> index N
                // No is likely N-2 or N-3
                // Jockey is likely N+3
                // Trainer is likely N+6
                
                // Let's assume standard racecard columns:
                // 馬號(0) | ... | 馬名(3) | ... | 騎師(6) | ... | 檔位(8) | 練馬師(9) | ...
                
                // Verification: find index of cell containing the name
                let nameIdx = -1;
                tds.each((idx, td) => {
                    if ($(td).find('a[href*="horseid="]').length > 0) {
                        nameIdx = idx;
                        return false; 
                    }
                });

                if (nameIdx === -1) return;

                // Relative positions based on observed structure (2026-01-29)
                // Name is pivot (0)
                // No: -3
                // Form: -2
                // Color: -1
                // Brand: +1
                // Weight: +2
                // Jockey: +3
                // Draw: +5
                // Trainer: +6
                // Rating: +8
                // Age: +13
                // Sex: +15
                
                const number = nameIdx >= 3 ? $(tds[nameIdx - 3]).text().trim() : $(tds[0]).text().trim();
                const weight = $(tds[nameIdx + 2]).text().trim();
                const jockey = $(tds[nameIdx + 3]).text().trim();
                const draw = $(tds[nameIdx + 5]).text().trim();
                const trainer = $(tds[nameIdx + 6]).text().trim();
                const rating = $(tds[nameIdx + 8]).text().trim();
                const age = $(tds[nameIdx + 13]).text().trim();
                const sex = $(tds[nameIdx + 15]).text().trim();

                // Trainer/Jockey might be inside links, but text() usually grabs it.
                // Links usually just wrap the name.

                currentRaceHorses.push({
                    number,
                    name,
                    horseId,
                    jockey,
                    trainer,
                    draw,
                    rating, 
                    weight,
                    age,
                    sex,
                    url: fullUrl,
                    performance: { 
                        horseId: horseId,
                        horseName: name,
                        rows: [] 
                    } // Will fill later
                });
            });

            if (currentRaceHorses.length === 0) break;

            // Check for duplicate race (redirect to race 1)
            const firstId = currentRaceHorses[0].horseId;
            if (i === 1) {
                firstRaceFirstHorseId = firstId;
            } else if (firstId === firstRaceFirstHorseId) {
                console.log(`Race ${i}: Duplicate of Race 1, stopping.`);
                break;
            }

            // Try to scrape statistics page
            // DEPRECATED: We now calculate stats from records directly.
            // Skipping stats page fetch to save time and avoid parsing errors.
            /*
            const statsUrl = `${RACECARD_URL.replace('racecard', 'racecard-statistics')}?RaceNo=${i}${date ? `&racedate=${date}` : ''}`;
            try {
                const statsHtml = await fetchHtml(statsUrl);
                // ... (Parsing logic removed)
            } catch (statsErr) {
                console.log(`Race ${i}: Could not fetch stats: ${statsErr}`);
            }
            */

            races.push({
                raceNumber: i,
                horses: currentRaceHorses,
                class: raceClass,
                distance: distance,
                venue: venue,
                track: track,
                location: location,
                conditions: raceConditions
            });
            console.log(`Race ${i}: Found ${currentRaceHorses.length} horses. Info: ${raceClass} ${distance}`);

        } catch (e: any) {
            console.error(`Error scraping Race ${i}:`, e.message);
            // If error, maybe race doesn't exist, continue to next or stop?
            // Usually sequential, so break
            break;
        }
    }
    return { races, raceDate: raceDate || '' };
}

async function scrapeHorsePerformance(url: string, horseId: string, horseName: string): Promise<HorsePerformanceRecord> {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    let targetTable: cheerio.Cheerio | null = null;

    $('table.bigborder').each((_, el) => {
        const tableText = $(el).text();
        if (tableText.includes('往績') || tableText.includes('賽事') || tableText.includes('名次')) {
            targetTable = $(el);
        }
    });

    if (!targetTable) {
        const fallback = $('table').first();
        targetTable = fallback.length ? fallback : null;
    }

    const rows: HorsePerformanceRow[] = [];

    if (targetTable) {
        targetTable.find('tr').each((index, el) => {
            if (index === 0) return;
            const tds = $(el).find('td');
            if (tds.length === 0) return;
            const columns: string[] = [];
            tds.each((_, td) => {
                const text = $(td).text().replace(/\s+/g, ' ').trim();
                columns.push(text);
            });
            if (columns.filter(c => c.length > 0).length === 0) return;
            rows.push({ columns });
        });
    }

    return {
        horseId,
        horseName,
        rows
    };
}

export async function scrapeTodayRacecard(date?: string): Promise<ScrapeResult> {
    console.log(`Scraping racecard... (Date: ${date || 'Default'})`);
    
    // 1. Scrape all races from racecard
    const { races, raceDate } = await scrapeAllRaces(date);
    
    if (races.length === 0) {
        throw new Error('No races found');
    }

    const uniqueHorses = new Map<string, { url: string; name: string; raceIndices: {r: number, h: number}[] }>();

    // Map all horses to find unique ones to scrape performance
    races.forEach((race, rIdx) => {
        race.horses.forEach((horse, hIdx) => {
            if (!uniqueHorses.has(horse.horseId)) {
                uniqueHorses.set(horse.horseId, { 
                    url: horse.url, 
                    name: horse.name,
                    raceIndices: []
                });
            }
            uniqueHorses.get(horse.horseId)?.raceIndices.push({ r: rIdx, h: hIdx });
        });
    });

    const records: HorsePerformanceRecord[] = [];

    // Scrape performance for each unique horse
    for (const [horseId, info] of uniqueHorses) {
        try {
            const record = await scrapeHorsePerformance(info.url, horseId, info.name);
            records.push(record);
            
            // Attach performance back to the race structure
            info.raceIndices.forEach(idx => {
                const race = races[idx.r];
                const horse = race.horses[idx.h];
                horse.performance = record;
                
                // Determine Current Season Dates based on Race Date
                // If Race Date is e.g. 2026/02/01, Season is 2025/2026
                // Season starts approx Sept 1st previous year
                let seasonStart = new Date();
                let seasonEnd = new Date();
                
                if (raceDate) {
                    const parsed = parseChineseDate(raceDate);
                    if (parsed) {
                        const rDate = new Date(parsed);
                        const rYear = rDate.getFullYear();
                        const rMonth = rDate.getMonth(); // 0-11
                        
                        // Season: Sept (8) to July (6)
                        let startYear = rYear;
                        if (rMonth < 8) { // Jan-Aug -> start year is previous year
                            startYear = rYear - 1;
                        }
                        seasonStart = new Date(startYear, 8, 1); // Sept 1st
                        seasonEnd = new Date(startYear + 1, 6, 31); // July 31st
                    }
                }

                // Calculate stats from records directly
                // Bypass HKJC stats table scraping which is unreliable
                const stats = calculateDetailedStats(record.rows, {
                    seasonStart,
                    seasonEnd,
                    class: race.class || '',
                    distance: race.distance || '',
                    venue: race.venue || '',
                    location: race.location || '',
                    jockey: horse.jockey
                });
                
                horse.stats = stats;
            });

        } catch (e) {
            console.error(`Failed to scrape performance for ${info.name}:`, e);
            continue;
        }
    }

    return {
        races: races,
        horses: records,
        scrapedAt: new Date().toISOString(),
        raceDate
    };
}

export function saveScrapeResultAsJson(result: ScrapeResult, outputDir?: string): string {
    const dir = outputDir || path.join(process.cwd(), 'output');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, `hkjc-scrape-${new Date().toISOString().slice(0, 10)}.json`);
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2), { encoding: 'utf-8' });
    return filePath;
}

export const HKJC_HEADERS = [
    "場次", "名次", "日期", "跑道/賽道", "路程", 
    "場地", "班次", "檔位", "評分", "練馬師", 
    "騎師", "頭馬距離", "獨贏賠率", "實際負磅", 
    "沿途走位", "完成時間", "馬匹體重", "配備"
];

export function saveScrapeResultAsExcel(result: ScrapeResult, outputDir?: string): string {
    const dir = outputDir || path.join(process.cwd(), 'output');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const workbook = XLSX.utils.book_new();

    // Create Summary Sheet (Racecard)
    const summaryData: any[][] = [];
    summaryData.push(['Race No', 'Horse No', 'Horse Name', 'Brand/ID', 'Jockey', 'Trainer', 'Draw', 'Rating', 'Weight']);
    
    result.races.forEach(race => {
        race.horses.forEach(horse => {
            summaryData.push([
                race.raceNumber,
                horse.number,
                horse.name,
                horse.horseId,
                horse.jockey,
                horse.trainer,
                horse.draw,
                horse.rating,
                horse.weight
            ]);
        });
    });
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Racecard Summary');

    // Individual Horse Sheets
    result.horses.forEach(record => {
        const sheetData: any[][] = [];
        sheetData.push(['Horse ID', record.horseId]);
        sheetData.push(['Horse Name', record.horseName]);
        sheetData.push([]);

        // Use precise headers, fill with generic ones if row has more columns
        const maxColumns = record.rows.reduce((max, row) => Math.max(max, row.columns.length), 0);
        const header: string[] = [];
        
        for (let i = 0; i < maxColumns; i++) {
            if (i < HKJC_HEADERS.length) {
                header.push(HKJC_HEADERS[i]);
            } else {
                header.push(`Col ${i + 1}`);
            }
        }
        
        if (maxColumns > 0) {
            sheetData.push(header);
        }

        record.rows.forEach(row => {
            sheetData.push(row.columns);
        });

        const sheet = XLSX.utils.aoa_to_sheet(sheetData);
        // Excel sheet names limited to 31 chars
        const safeName = record.horseName.replace(/[\\/?*[\]]/g, '').slice(0, 25) || record.horseId;
        
        // Ensure unique sheet names
        let uniqueSheetName = safeName;
        let counter = 1;
        while (workbook.Sheets[uniqueSheetName]) {
            uniqueSheetName = `${safeName.slice(0, 20)}_${counter}`;
            counter++;
        }

        XLSX.utils.book_append_sheet(workbook, sheet, uniqueSheetName);
    });

    const filePath = path.join(dir, `hkjc-scrape-${new Date().toISOString().slice(0, 10)}.xlsx`);
    XLSX.writeFile(workbook, filePath);
    return filePath;
}

async function runCli() {
    try {
        const result = await scrapeTodayRacecard();
        const jsonPath = saveScrapeResultAsJson(result);
        const excelPath = saveScrapeResultAsExcel(result);
        console.log('Scrape completed.');
        console.log(`JSON saved to: ${jsonPath}`);
        console.log(`Excel saved to: ${excelPath}`);
    } catch (e: any) {
        console.error('Scrape failed:', e.message || e);
        process.exitCode = 1;
    }
}

if (require.main === module) {
    runCli();
}

