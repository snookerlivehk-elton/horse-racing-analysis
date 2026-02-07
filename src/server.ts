import 'dotenv/config';
import express from 'express';
import * as path from 'path';
import * as XLSX from 'xlsx';
import prisma from './lib/prisma';
import { processMissingSectionals } from './services/sectionalScraper';
import { scrapeTodayRacecard, ScrapeResult, HKJC_HEADERS, RaceHorseInfo, scrapeHorseProfile, HorsePerformanceRow, HorseProfileExtended, HorsePerformanceRecord } from './hkjcScraper';
import { saveScrapeResultToDb, updateHorseProfileInDb, getHorseProfileFromDb } from './services/dbService';
import { fetchOdds, saveOddsHistory } from './services/oddsService';
import { startScheduler } from './services/schedulerService';
import { updateAllHorseProfiles } from './services/profileService';
import { scrapeRaceTrackwork } from './services/trackworkScraper';
import { scrapeAndSaveJ18Trend, scrapeAndSaveJ18Like, scrapeAndSaveJ18Payout } from './services/j18Service';
import { calculateOddsDrops, calculateFundFlow, calculatePunditPerf } from './services/statsService';
import { AnalysisService } from './services/analysisService';
import { SpeedProScraper } from './services/speedProScraper';

const app = express();
const analysisService = new AnalysisService();
const speedProScraper = new SpeedProScraper();
const PORT = process.env.PORT || 3000;

app.use(express.json()); // Enable JSON body parsing
app.use(express.urlencoded({ extended: true }));

// View Engine Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Enable CORS for Client-Side Extension
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Start Scheduler
startScheduler();
const VERSION = "1.6.9"; // Bump version to force update & confirm deployment

let lastScrapeResult: ScrapeResult | null = null;
let lastScrapeError: string | null = null;

// Helper to reconstruct ScrapeResult from DB
async function fetchLatestRaceDataFromDb(): Promise<ScrapeResult | null> {
    try {
        // 1. Find the latest race date
        const latestRace = await prisma.race.findFirst({
            orderBy: { date: 'desc' }
        });

        if (!latestRace) return null;

        const targetDate = latestRace.date;

        // 2. Fetch all races for that date
        const races = await prisma.race.findMany({
            where: { date: targetDate },
            include: { results: true },
            orderBy: { raceNo: 'asc' }
        });

        if (races.length === 0) return null;

        // Collect all horse names to batch fetch profiles
        const allHorseNames = races.flatMap(r => r.results.map(res => res.horseName)).filter(n => n) as string[];
        const horseProfiles = await prisma.horse.findMany({
            where: { name: { in: allHorseNames } },
            include: { performances: { orderBy: { date: 'desc' } } }
        });
        const horseMap = new Map(horseProfiles.map(h => [h.name, h]));

        // 3. Reconstruct races array
        const reconstructedRaces = races.map(r => {
             return {
                raceId: r.id,
                raceNumber: r.raceNo,
                venue: r.venue,
                location: r.venue === 'HV' ? '跑馬地' : '沙田',
                distance: r.distance?.toString() || '', 
                class: r.class || '',
                track: r.trackType || '',
                course: r.course || '',
                surface: '',
                conditions: '',
                
                horses: r.results.map(res => {
                    const horseProfile = res.horseName ? horseMap.get(res.horseName) : undefined;
                    
                    let performance = undefined;

                    if (horseProfile && horseProfile.performances) {
                         // Map to HorsePerformanceRow
                         const rows: HorsePerformanceRow[] = horseProfile.performances.map(p => ({
                             columns: [
                                 p.raceIndex || '', // 0
                                 p.place || '', // 1
                                 p.date || '', // 2
                                 p.course || '', // 3
                                 p.distance || '', // 4
                                 p.venue || '', // 5 (Going)
                                 p.class || '', // 6
                                 p.draw || '', // 7
                                 p.rating || '', // 8
                                 p.trainer || '', // 9
                                 p.jockey || '', // 10
                                 p.lbw || '', // 11
                                 p.winOdds || '', // 12
                                 p.actualWeight || '', // 13
                                 '', '', '', '' // 14-17
                             ]
                         }));

                         performance = {
                             horseId: horseProfile.hkjcId,
                             horseName: horseProfile.name,
                             rows: rows
                         };
                    }

                    return {
                        number: res.horseNo.toString(),
                        name: res.horseName || '',
                        jockey: res.jockey || '',
                        trainer: res.trainer || '',
                        rating: res.rating || '0',
                        ratingChange: res.ratingChange || '',
                        horseId: horseProfile?.hkjcId || '', 
                        draw: res.draw || '',
                        weight: res.weight || '',
                        gear: res.gear || '',
                        age: horseProfile?.age || '',
                        sex: horseProfile?.sex || '',
                        url: horseProfile ? `https://racing.hkjc.com/zh-hk/local/information/horse?horseId=${horseProfile.hkjcId}` : '',
                        performance: performance
                    };
                })
            };
        });

        // 4. Return ScrapeResult
        return {
            raceDate: targetDate,
            races: reconstructedRaces as any,
            horses: [], 
            scrapedAt: new Date().toISOString()
        };

    } catch (e) {
        console.error('DB Fetch Error:', e);
        return null;
    }
}

// 設定 EJS 為視圖引擎
app.set('view engine', 'ejs');
// 使用 process.cwd() 確保路徑正確，防止 __dirname 在不同環境下的差異
app.set('views', path.join(process.cwd(), 'views'));








app.get('/debug', (req, res) => {
    const fs = require('fs');
    try {
        const viewsPath = app.get('views');
        const viewsFiles = fs.readdirSync(viewsPath);
        res.json({
            version: VERSION,
            cwd: process.cwd(),
            __dirname: __dirname,
            viewsPath: viewsPath,
            viewsFiles: viewsFiles
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

app.get('/odds', (req, res) => {
    res.render('odds');
});

app.get('/horse/:horseId', async (req, res) => {
    try {
        const { horseId } = req.params;
        const horse = await getHorseProfileFromDb(horseId);
        
        if (!horse) {
            // Try to scrape if not in DB
            try {
                const scrapedProfile = await scrapeHorseProfile(horseId);
                await updateHorseProfileInDb(scrapedProfile);
                // Fetch again with formatted data
                const newHorse = await getHorseProfileFromDb(horseId);
                return res.render('horse', { 
                    horseName: newHorse?.name,
                    horseId: newHorse?.id,
                    profile: newHorse,
                    records: newHorse?.records || []
                });
            } catch (e) {
                return res.status(404).send(`Horse ${horseId} not found and scrape failed.`);
            }
        }
        
        res.render('horse', { 
            horseName: horse.name,
            horseId: horse.id,
            profile: horse,
            records: horse.records
        });
    } catch (e: any) {
        console.error('Horse View Error:', e);
        res.status(500).send(e.message);
    }
});

app.get('/api/odds', async (req, res) => {
    try {
        const date = req.query.date as string;
        const venueCode = (req.query.venueCode as string) || "ST";
        const raceNo = parseInt(req.query.raceNo as string) || 1;

        if (!date) {
            return res.status(400).json({ error: "Date is required (YYYY-MM-DD)" });
        }

        console.log(`Fetching odds for ${date} ${venueCode} Race ${raceNo}`);
        const result = await fetchOdds({
            date,
            venueCode,
            raceNo
        });

        // Async save to history (don't block response)
        saveOddsHistory(date, venueCode, raceNo, result.pools);

        res.json(result);
    } catch (e: any) {
        console.error('Odds fetch error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/odds/push', async (req, res) => {
    try {
        // Support two formats:
        // 1. Raw pools from GraphQL interception (Recommended)
        // 2. Processed odds maps (Fallback)
        const { date, venue, raceNo, pools, winOdds, placeOdds, qinOdds, qplOdds } = req.body;

        if (!date || !venue || !raceNo) {
            return res.status(400).json({ error: "Missing required fields: date, venue, raceNo" });
        }

        console.log(`Received pushed odds for ${date} ${venue} Race ${raceNo}`);
        
        const { saveOddsDirectly, saveOddsHistory } = require('./services/oddsService');

        if (pools && Array.isArray(pools)) {
            // Case 1: Raw pools
            console.log(`Processing ${pools.length} raw pools...`);
            await saveOddsHistory(date, venue, raceNo, pools);
        } else if (winOdds) {
            // Case 2: Processed maps
            await saveOddsDirectly(date, venue, raceNo, winOdds, placeOdds, qinOdds, qplOdds);
        } else {
            return res.status(400).json({ error: "Missing odds data (pools or winOdds)" });
        }

        res.json({ success: true });
    } catch (e: any) {
        console.error('Odds push error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/scrape-race-data', async (req, res) => {
    try {
        console.log('Starting scrape...');
        // If date is provided, use it. Otherwise undefined to fetch latest.
        const date = req.query.date ? (req.query.date as string) : undefined;
        console.log(`Scraping for date: ${date || 'Latest (Default)'}`);
        
        const result = await scrapeTodayRacecard(date);
        lastScrapeResult = result;
        lastScrapeError = null;

        // Save to DB asynchronously (don't block response too long, or block if needed)
        // Let's await it to show DB status in response
        console.log('Saving to database...');
        const dbResult = await saveScrapeResultToDb(result);
        console.log(`Saved ${dbResult.savedCount} horses to DB.`);

        // Trigger background profile update
        const allHorses = result.races.flatMap(r => r.horses);
        updateAllHorseProfiles(allHorses).catch(err => console.error('Background profile update error:', err));

        res.json({
            ...result,
            dbStatus: {
                saved: dbResult.savedCount,
                errors: dbResult.errors
            }
        });
    } catch (e: any) {
        console.error('Scrape error:', e);
        const message = e?.message || 'Unknown error';
        lastScrapeError = message;
        res.status(500).json({ error: message });
    }
});

app.get('/scrape-data', async (req, res) => {
    try {
        let date = req.query.date ? (req.query.date as string) : undefined;
        
        // Normalize Chinese date format: 2026年2月1日 -> 2026/02/01
        if (date && date.includes('年')) {
            const match = date.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
            if (match) {
                const y = match[1];
                const m = match[2].padStart(2, '0');
                const d = match[3].padStart(2, '0');
                date = `${y}/${m}/${d}`;
                console.log(`Normalized date: ${date}`);
            }
        }
        
        // Strategy:
        // 1. If date provided, force scrape (or fetch from DB for that date)
        // 2. If no date, try memory (lastScrapeResult)
        // 3. If memory empty, try DB (fetchLatestRaceDataFromDb)
        // 4. If DB empty, scrape live
        
        if (date) {
             // For now, force scrape if date is specific (TODO: Check DB first)
             console.log(`Scraping for specific date: ${date}`);
             try {
                lastScrapeResult = await scrapeTodayRacecard(date);
                lastScrapeError = null;
             } catch (e: any) {
                console.error(`Scrape failed for ${date}:`, e);
                lastScrapeError = e.message;
                // If failed, try to load from DB just in case
                // ... logic to load from DB by date could be added here
             }
        } else {
            // No date provided - Default view
            if (!lastScrapeResult) {
                // Try DB first
                console.log('Memory empty, checking DB for latest race data...');
                const dbData = await fetchLatestRaceDataFromDb();
                if (dbData) {
                    console.log(`Found data in DB for ${dbData.raceDate}`);
                    lastScrapeResult = dbData;
                } else {
                    // DB empty, scrape live
                    console.log('DB empty, scraping live...');
                    lastScrapeResult = await scrapeTodayRacecard();
                }
                lastScrapeError = null;
            }
        }

        res.render('scrape', {
            scrapeResult: lastScrapeResult,
            scrapeError: lastScrapeError,
            lastUpdated: lastScrapeResult ? lastScrapeResult.scrapedAt : null,
            serverVersion: VERSION
        });
    } catch (error: any) {
        res.status(500).send(`Server Error: ${error.message}`);
    }
});

// Analysis overview route removed

app.post('/api/scrape/trackwork', async (req, res) => {
    try {
        // Fallback to DB if memory is empty
        if (!lastScrapeResult) {
            lastScrapeResult = await fetchLatestRaceDataFromDb();
        }

        if (!lastScrapeResult || !lastScrapeResult.races) {
            return res.status(400).json({ error: 'No race data available. Please scrape racecard first.' });
        }

        let date = lastScrapeResult.raceDate || '2026/01/01'; // Fallback if undefined
        
        // Fix Chinese date format (2026年2月1日 -> 2026/02/01)
        if (date.includes('年')) {
            const match = date.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
            if (match) {
                const [_, y, m, d] = match;
                date = `${y}/${m.padStart(2, '0')}/${d.padStart(2, '0')}`;
            }
        }

        const results = [];

        console.log(`Starting trackwork scrape for date: ${date}`);

        for (const race of lastScrapeResult.races) {
            // Map venue/location to HKJC code (ST/HV)
            let venueCode = 'ST';
            if (race.location === '跑馬地' || race.venue === 'HV' || race.venue === 'Happy Valley') {
                venueCode = 'HV';
            } else if (race.location === '沙田' || race.venue === 'ST' || race.venue === 'Sha Tin') {
                venueCode = 'ST';
            } else if (race.venue === '全天候跑道') {
                venueCode = 'ST';
            }
            
            console.log(`Scraping trackwork for Race ${race.raceNumber} (${venueCode})...`);
            
            try {
                const count = await scrapeRaceTrackwork({
                    date,
                    venue: venueCode, 
                    raceNo: race.raceNumber
                });
                results.push({ race: race.raceNumber, count });
            } catch (err: any) {
                console.error(`Error scraping trackwork for Race ${race.raceNumber}:`, err);
                results.push({ race: race.raceNumber, error: err.message });
            }
        }

        res.json({ success: true, results });
    } catch (e: any) {
        console.error('Trackwork scrape error:', e);
        res.status(500).json({ error: e.message });
    }
});



app.post('/api/scrape/sectionals', async (req, res) => {
    try {
        console.log('Processing missing sectionals...');
        // This runs in background as it can take time
        // We don't await the full process if we want to return quickly, 
        // but for now let's await to see output in logs or use fire-and-forget
        processMissingSectionals().then(() => console.log('Sectional processing finished')).catch(err => console.error(err));
        
        res.json({ success: true, message: 'Sectional scraping started in background' });
    } catch (e: any) {
        console.error('Sectional Scrape Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// SpeedPro Scraping Endpoint
app.post('/api/scrape/speedpro', async (req, res) => {
    console.log('Manual trigger: SpeedPro Scraping...');
    try {
        // Run in background to avoid timeout
        speedProScraper.scrapeAll().then(() => {
            console.log('Manual SpeedPro scraping completed.');
        }).catch(err => {
            console.error('Manual SpeedPro scraping failed:', err);
        });
        
        res.json({ success: true, message: "SpeedPro scraping triggered in background. Check server logs for progress." });
    } catch (error: any) {
        console.error('Error triggering SpeedPro scraper:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- SpeedPro Analysis Routes ---

app.get('/speedpro', (req, res) => {
    res.render('speedpro', { serverVersion: VERSION });
});

// Get available dates for SpeedPro
app.get('/api/speedpro/dates', async (req, res) => {
    try {
        // Find races that have SpeedPro data
        const races = await prisma.race.findMany({
            where: {
                speedPros: {
                    some: {} // At least one SpeedPro record exists
                }
            },
            select: {
                date: true
            },
            distinct: ['date'],
            orderBy: {
                date: 'desc'
            }
        });
        
        const dates = races.map(r => r.date);
        res.json({ success: true, dates });
    } catch (error: any) {
        console.error('Error fetching SpeedPro dates:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get SpeedPro data for a specific date
app.get('/api/speedpro/data', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date || typeof date !== 'string') {
            return res.status(400).json({ success: false, message: 'Date parameter is required' });
        }

        const data = await prisma.speedPro.findMany({
            where: {
                race: {
                    date: date
                }
            },
            include: {
                race: {
                    select: {
                        raceNo: true,
                        venue: true
                    }
                }
            },
            orderBy: [
                { race: { raceNo: 'asc' } },
                { horseNo: 'asc' }
            ]
        });

        // Flatten the structure for easier frontend consumption
        const flattened = data.map(item => ({
            id: item.id,
            raceId: item.raceId,
            raceNo: item.race.raceNo,
            venue: item.race.venue,
            horseNo: item.horseNo,
            horseName: item.horseName,
            draw: item.draw,
            energyReq: item.energyReq,
            assessment: item.assessment
        }));

        res.json({ success: true, data: flattened });
    } catch (error: any) {
        console.error('Error fetching SpeedPro data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// J18 Scraping Endpoints
app.post('/api/scrape/j18/trend', async (req, res) => {
    try {
        const date = req.body.date; // YYYY-MM-DD
        if (!date) return res.status(400).json({ error: 'Date is required' });
        await scrapeAndSaveJ18Trend(date);
        res.json({ success: true, message: `J18 Trend scraped for ${date}` });
    } catch (e: any) {
        console.error('J18 Trend Scrape Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/scrape/j18/like', async (req, res) => {
    try {
        const date = req.body.date;
        if (!date) return res.status(400).json({ error: 'Date is required' });
        await scrapeAndSaveJ18Like(date);
        res.json({ success: true, message: `J18 Like scraped for ${date}` });
    } catch (e: any) {
        console.error('J18 Like Scrape Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/scrape/j18/payout', async (req, res) => {
    try {
        const date = req.body.date;
        if (!date) return res.status(400).json({ error: 'Date is required' });
        await scrapeAndSaveJ18Payout(date);
        res.json({ success: true, message: `J18 Payout scraped for ${date}` });
    } catch (e: any) {
        console.error('J18 Payout Scrape Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/stats/odds-drop/:raceId', async (req, res) => {
    try {
        const raceId = req.params.raceId;
        const drops = await calculateOddsDrops(raceId);
        res.json(drops);
    } catch (e: any) {
        console.error('Odds Drop Calc Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/stats/fund-flow/:raceId', async (req, res) => {
    try {
        const raceId = req.params.raceId;
        const flows = await calculateFundFlow(raceId);
        res.json(flows);
    } catch (e: any) {
        console.error('Fund Flow Calc Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/stats/pundit-perf/:raceId', async (req, res) => {
    try {
        const raceId = req.params.raceId;
        const perf = await calculatePunditPerf(raceId);
        res.json(perf);
    } catch (e: any) {
        console.error('Pundit Perf Calc Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/analysis/j18/:raceId', async (req, res) => {
    try {
        const raceId = req.params.raceId;
        const race = await prisma.race.findUnique({ where: { id: raceId } });
        if (!race) return res.status(404).send('Race not found');

        const oddsDrops = await calculateOddsDrops(raceId);
        const fundFlow = await calculateFundFlow(raceId);
        const punditPerf = await calculatePunditPerf(raceId);
        const trendAnalysis = await analysisService.getRaceTrendAnalysis(raceId);

        res.render('analysis_j18', {
            race,
            oddsDrops,
            fundFlow,
            punditPerf,
            trendAnalysis
        });
    } catch (e: any) {
        console.error('Analysis View Error:', e);
        res.status(500).send(e.message);
    }
});

app.get('/scrape-data/excel', async (req, res) => {
    try {
        if (!lastScrapeResult) {
            const date = (req.query.date as string) || '2026/01/28';
            const result = await scrapeTodayRacecard(date);
            lastScrapeResult = result;
            lastScrapeError = null;
        }

        if (!lastScrapeResult) {
            res.status(500).send('沒有可用的爬蟲結果');
            return;
        }

        const workbook = XLSX.utils.book_new();

        lastScrapeResult.horses.forEach(record => {
            const sheetData: any[][] = [];
            
            let horseId: string;
            let horseName: string;
            let dataRows: string[][] = [];

            if ('records' in record) {
                // HorseProfileExtended
                const profile = record as HorseProfileExtended;
                horseId = profile.id;
                horseName = profile.name;
                dataRows = profile.records.map(r => [
                    r.raceIndex, r.rank, r.date, r.course, r.distance, 
                    r.venue, r.class, r.draw, r.rating, r.trainer, 
                    r.jockey, '-', r.odds, r.weight, 
                    r.runningPosition || '', r.finishTime || '', r.horseWeight || '', r.gear || ''
                ]);
            } else {
                // HorsePerformanceRecord
                const perf = record as HorsePerformanceRecord;
                horseId = perf.horseId;
                horseName = perf.horseName;
                dataRows = perf.rows.map(r => r.columns);
            }

            sheetData.push(['Horse ID', horseId]);
            sheetData.push(['Horse Name', horseName]);
            sheetData.push([]);

            // Use precise headers
            const maxColumns = dataRows.reduce((max, row) => Math.max(max, row.length), 0);
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

            dataRows.forEach(row => {
                sheetData.push(row);
            });

            const sheet = XLSX.utils.aoa_to_sheet(sheetData);
            const safeName = horseName.replace(/[\\/?*[\]]/g, '').slice(0, 25) || horseId;
            XLSX.utils.book_append_sheet(workbook, sheet, safeName);
        });

        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        const filename = `hkjc-scrape-${new Date().toISOString().slice(0, 10)}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (error: any) {
        res.status(500).send(`Server Error: ${error.message}`);
    }
});

app.get('/', async (req, res) => {
    try {
        const racesCount = await prisma.race.count();
        const latestRace = await prisma.race.findFirst({
            orderBy: { date: 'desc' }
        });
        const lastUpdated = latestRace ? latestRace.date : 'N/A';

        // Fetch recent races for the overview
        const recentRaces = await prisma.race.findMany({
            orderBy: { date: 'desc' },
            take: 100 // Show last 100 races (approx 10 meetings)
        });

        // Group by date
        const groupedRaces: Record<string, any[]> = {};
        recentRaces.forEach(race => {
            if (!groupedRaces[race.date]) {
                groupedRaces[race.date] = [];
            }
            groupedRaces[race.date].push(race);
        });

        // Sort races within each date
        Object.keys(groupedRaces).forEach(date => {
            groupedRaces[date].sort((a, b) => a.raceNo - b.raceNo);
        });

        res.render('index', {
            racesCount,
            lastUpdated,
            serverVersion: VERSION,
            groupedRaces // Pass the missing variable
        });
    } catch (e: any) {
        console.error('Root route error:', e);
        res.render('index', {
            racesCount: 0,
            lastUpdated: 'Error fetching data',
            serverVersion: VERSION,
            groupedRaces: {} // Pass empty object on error to prevent view crash
        });
    }
});

// J18 Analysis - System Stats
app.get('/stats', (req, res) => {
    res.render('stats');
});

app.get('/api/analysis/stats/system', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const stats = await analysisService.getSystemStats(
            startDate as string,
            endDate as string
        );
        res.json(stats);
    } catch (error: any) {
        console.error('Error fetching system stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// J18 Analysis - Race Trend
app.get('/api/analysis/stats/race/:raceId', async (req, res) => {
    try {
        const stats = await analysisService.getRaceTrendAnalysis(req.params.raceId);
        res.json(stats);
    } catch (error: any) {
        console.error('Error fetching race trend stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// J18 Analysis - Hit Rates (Merged into Home Page)
// app.get('/analysis/hit-rates', (req, res) => {
//    res.render('analysis_hit_rates');
// });

app.get('/api/analysis/hit-rates', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const stats = await analysisService.getHitRateStats(
            startDate as string,
            endDate as string
        );
        res.json(stats);
    } catch (error: any) {
        console.error('Error fetching hit rate stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// New Daily Analysis Route
app.get('/analysis/daily', (req, res) => {
    res.render('analysis_daily');
});

app.get('/api/analysis/daily-stats', async (req, res) => {
    try {
        const { startDate, endDate, type, trendKey } = req.query;
        if (!startDate || !endDate || !type) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const stats = await analysisService.getDailyStats(
            startDate as string,
            endDate as string,
            type as 'pundit' | 'trend',
            trendKey as string
        );
        res.json(stats);
    } catch (error: any) {
        console.error('Error fetching daily stats:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
