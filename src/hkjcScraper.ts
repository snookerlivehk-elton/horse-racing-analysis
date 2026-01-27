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

export interface RaceHorseInfo {
    number: string;
    name: string;
    horseId: string;
    jockey: string;
    trainer: string;
    draw: string; // 檔位
    rating: string; // 評分
    weight: string; // 負磅
    url: string;
    performance?: HorsePerformanceRecord;
}

export interface RaceInfo {
    raceNumber: number;
    horses: RaceHorseInfo[];
}

export interface ScrapeResult {
    races: RaceInfo[];
    horses: HorsePerformanceRecord[]; // Keep flat list for backward compatibility if needed, or just derive
    scrapedAt: string;
}

const BASE_URL = 'https://racing.hkjc.com';
const RACECARD_URL = 'https://racing.hkjc.com/zh-hk/local/information/racecard';

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

async function scrapeAllRaces(date?: string): Promise<RaceInfo[]> {
    const races: RaceInfo[] = [];
    const maxRaces = 14; 
    let firstRaceFirstHorseId: string | null = null;

    for (let i = 1; i <= maxRaces; i++) {
        let url = `${RACECARD_URL}?race_no=${i}`;
        if (date) {
            url = `${RACECARD_URL}?racedate=${date}&RaceNo=${i}`;
        }
        
        try {
            const html = await fetchHtml(url);
            const $ = cheerio.load(html);
            
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

                // Relative positions based on standard HKJC card
                // Horse No is usually first column with content, or check header.
                // Let's assume nameIdx is roughly column 3 (0-based)
                // If nameIdx is 3:
                // 0: No, 1: Form, 2: Color, 3: Name
                
                const number = $(tds[0]).text().trim();
                const jockey = $(tds[nameIdx + 3]).text().trim(); // Rough guess
                const trainer = $(tds[nameIdx + 6]).text().trim(); // Rough guess
                const draw = $(tds[nameIdx + 5]).text().trim(); // Rough guess
                const rating = $(tds[nameIdx + 7]).text().trim(); // Rough guess
                const weight = $(tds[nameIdx + 2]).text().trim(); // Rough guess

                // Refined Logic based on typical structure
                // Use header if possible, but for now simple mapping
                // Actually, let's just grab logical text
                // Trainer usually has a link too
                const trainerText = $tr.find('a[href*="trainerno="]').text().trim() || $(tds[9]).text().trim();
                const jockeyText = $tr.find('a[href*="jockeycode="]').text().trim() || $(tds[6]).text().trim();
                
                currentRaceHorses.push({
                    number,
                    name,
                    horseId,
                    jockey: jockeyText,
                    trainer: trainerText,
                    draw: $(tds[8]).text().trim(), // Standard Draw col
                    rating: $(tds[10]).text().trim(), // Standard Rating col
                    weight: $(tds[5]).text().trim(), // Standard Weight col
                    url: fullUrl
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

            races.push({
                raceNumber: i,
                horses: currentRaceHorses
            });
            console.log(`Race ${i}: Found ${currentRaceHorses.length} horses.`);

        } catch (e: any) {
            console.error(`Error scraping Race ${i}:`, e.message);
            // If error, maybe race doesn't exist, continue to next or stop?
            // Usually sequential, so break
            break;
        }
    }
    return races;
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
    const races = await scrapeAllRaces(date);

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
                races[idx.r].horses[idx.h].performance = record;
            });

        } catch (e) {
            console.error(`Failed to scrape performance for ${info.name}:`, e);
            continue;
        }
    }

    return {
        races: races,
        horses: records,
        scrapedAt: new Date().toISOString()
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

