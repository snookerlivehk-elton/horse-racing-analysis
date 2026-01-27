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

export interface ScrapeResult {
    horses: HorsePerformanceRecord[];
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
    const response = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
            'Accept-Language': 'zh-HK,zh;q=0.9,en;q=0.8'
        },
        timeout: 15000
    });
    return response.data;
}

async function scrapeRacecardHorseLinks(): Promise<{ horseId: string; horseName: string; url: string }[]> {
    const html = await fetchHtml(RACECARD_URL);
    const $ = cheerio.load(html);

    const links: { horseId: string; horseName: string; url: string }[] = [];

    $('table a[href*="/zh-hk/local/information/horse?horseid="]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const horseName = $(el).text().trim();
        const fullUrl = buildUrl(href);
        if (!fullUrl) return;
        const match = href.match(/horseid=([^&]+)/i);
        if (!match) return;
        const horseId = match[1];
        if (!horseId || !horseName) return;
        links.push({ horseId, horseName, url: fullUrl });
    });

    const uniqueMap = new Map<string, { horseId: string; horseName: string; url: string }>();
    links.forEach(link => {
        if (!uniqueMap.has(link.horseId)) {
            uniqueMap.set(link.horseId, link);
        }
    });

    return Array.from(uniqueMap.values());
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

export async function scrapeTodayRacecard(): Promise<ScrapeResult> {
    const horseLinks = await scrapeRacecardHorseLinks();

    const records: HorsePerformanceRecord[] = [];

    for (const link of horseLinks) {
        try {
            const record = await scrapeHorsePerformance(link.url, link.horseId, link.horseName);
            records.push(record);
        } catch (e) {
            continue;
        }
    }

    return {
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
        const safeName = record.horseName.replace(/[\\/?*[\]]/g, '').slice(0, 25) || record.horseId;
        XLSX.utils.book_append_sheet(workbook, sheet, safeName);
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

