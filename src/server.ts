import 'dotenv/config';
import express from 'express';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { fetchRaceTrends } from './apiClient';
import { analyzeHitRates, analyzeBigMovers, analyzeQuinellaComposition } from './trendAnalysis';
import { HitRateStats, TimePoint, MoverStats, QuinellaStats } from './types';
import { scrapeTodayRacecard, ScrapeResult, HKJC_HEADERS, RaceHorseInfo, scrapeHorseProfile } from './hkjcScraper';
import { saveScrapeResultToDb, updateHorseProfileInDb, getHorseProfileFromDb } from './services/dbService';
import { fetchOdds, saveOddsHistory } from './services/oddsService';
import { startScheduler } from './services/schedulerService';
import { updateAllHorseProfiles } from './services/profileService';
import { ScoringEngine } from './services/scoringEngine';
import { scrapeRaceTrackwork } from './services/trackworkScraper';
import prisma from './lib/prisma';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json()); // Enable JSON body parsing
app.use(express.urlencoded({ extended: true }));

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
const VERSION = "1.6.3"; // Added Profile Service

let lastScrapeResult: ScrapeResult | null = null;
let lastScrapeError: string | null = null;

// 設定 EJS 為視圖引擎
app.set('view engine', 'ejs');
// 使用 process.cwd() 確保路徑正確，防止 __dirname 在不同環境下的差異
app.set('views', path.join(process.cwd(), 'views'));

app.get('/api/analysis/score/:raceId', async (req, res) => {
    try {
        const { raceId } = req.params;
        
        // Find race to get horses
        // Currently our scraping logic might not be fully linked to the 'Race' model via Relations yet
        // depending on how scrapeTodayRacecard saves data.
        // But assuming we can get horse IDs from the race.
        
        // Alternative: Pass horse IDs or just analyze all horses in the race if linked.
        // Let's assume we want to analyze a list of horses provided in body, or fetch from Race ID.
        
        // For now, let's try to fetch the Race from DB and its horses (if linked via RacePerformance).
        // If relations aren't fully set up in scraper, we might need to rely on scraping result.
        
        // Let's assume the user passes horse IDs for now to be flexible, or we query RaceResult/Performance.
        // Better: Query RacePerformance for this race (if we have raceId as our DB ID).
        
        // If raceId is HKJC format (e.g. 20260201-ST-1)
        const race = await prisma.race.findUnique({
            where: { hkjcId: raceId },
            include: { results: true }
        });
        
        let horseIds: string[] = [];
        
        if (race) {
            // If we have results/entries
            // We need to map horse names to Horse IDs in our DB
            // This assumes RaceResult has horseName and we can look them up
            const names = race.results.map(r => r.horseName).filter(n => n !== null) as string[];
            const horses = await prisma.horse.findMany({
                where: { name: { in: names } },
                select: { id: true }
            });
            horseIds = horses.map(h => h.id);
        } else {
            // Fallback: If no race found (maybe not scraped into DB yet?), 
            // accept direct list of horse IDs or names from query?
            // For this iteration, let's just return error if race not found.
            // OR: If we are calling this from frontend which has horse IDs.
        }

        if (horseIds.length === 0) {
             return res.status(404).json({ error: "No horses found for this race. Ensure race is scraped." });
        }

        const engine = new ScoringEngine();
        const scores = await engine.analyzeRace(horseIds);

        res.json({
            raceId,
            scores
        });

    } catch (e: any) {
        console.error('Analysis error:', e);
        res.status(500).json({ error: e.message });
    }
});

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
        const date = req.query.date ? (req.query.date as string) : undefined;
        
        // If we have a result but for a different date (not implemented yet) or no result
        // For now just re-scrape if query date differs? 
        // Or strictly following existing logic: if (!lastScrapeResult) scrape.
        // But if user wants specific date, we should probably force scrape or check date.
        // Let's just force scrape if date is provided in query, OR if no result.
        // But simply:
        
        if (!lastScrapeResult && !lastScrapeError) {
            try {
                console.log(`Scraping for date (view): ${date || 'Latest'}`);
                const result = await scrapeTodayRacecard(date);
                lastScrapeResult = result;
                lastScrapeError = null;
            } catch (e: any) {
                lastScrapeError = e?.message || 'Unknown error';
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

app.get('/analysis', (req, res) => {
    try {
        if (!lastScrapeResult || !lastScrapeResult.races) {
            return res.render('analysis', { hasData: false });
        }

        // 1. Jockey Stats
        const jockeyMap = new Map<string, number>();
        // 2. Trainer Stats
        const trainerMap = new Map<string, number>();
        // 3. Top Rated Horses
        const topRatedHorses: any[] = [];

        lastScrapeResult.races.forEach(race => {
            // Find max rating in this race
            let maxRating = -1;
            let bestHorse: any = null;

            race.horses.forEach(horse => {
                // Jockey Count
                const j = horse.jockey.replace(/\(\d+\)/, '').trim(); // Remove weight allowance if any e.g. (2)
                jockeyMap.set(j, (jockeyMap.get(j) || 0) + 1);

                // Trainer Count
                const t = horse.trainer;
                trainerMap.set(t, (trainerMap.get(t) || 0) + 1);

                // Rating check
                const rating = parseInt(horse.rating) || 0;
                if (rating > maxRating) {
                    maxRating = rating;
                    bestHorse = horse;
                }
            });

            if (bestHorse) {
                topRatedHorses.push({
                    race: race.raceNumber,
                    number: bestHorse.number,
                    name: bestHorse.name,
                    rating: bestHorse.rating,
                    jockey: bestHorse.jockey,
                    trainer: bestHorse.trainer
                });
            }
        });

        // Sort and slice top 10
        const jockeyStats = Array.from(jockeyMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const trainerStats = Array.from(trainerMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        res.render('analysis', {
            hasData: true,
            jockeyStats,
            trainerStats,
            topRatedHorses,
            serverVersion: VERSION
        });

    } catch (error: any) {
        res.status(500).send(`Analysis Error: ${error.message}`);
    }
});

app.post('/api/scrape/trackwork', async (req, res) => {
    try {
        if (!lastScrapeResult || !lastScrapeResult.races) {
            return res.status(400).json({ error: 'No race data available. Please scrape racecard first.' });
        }

        const date = lastScrapeResult.raceDate || '2026/01/01'; // Fallback if undefined
        const results = [];

        console.log(`Starting trackwork scrape for date: ${date}`);

        for (const race of lastScrapeResult.races) {
            const venue = race.venue || 'ST'; // Default to ST if missing
            console.log(`Scraping trackwork for Race ${race.raceNumber} (${venue})...`);
            
            try {
                const count = await scrapeRaceTrackwork({
                    date,
                    venue, 
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
            sheetData.push(['Horse ID', record.horseId]);
            sheetData.push(['Horse Name', record.horseName]);
            sheetData.push([]);

            // Use precise headers
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
        // 1. 獲取數據 (目前使用 Mock)
        // TODO: 上線時將 useMock 改為 false，並確認 API_BASE_URL
        const useMock = true;
        const races = await fetchRaceTrends(undefined, useMock);

        // 2. 分析各個時間點
        const timePoints: TimePoint[] = ["30'", "15'", "10'", "5'", "0'"];
        const analysisResults: { timePoint: TimePoint; stats: HitRateStats }[] = [];

        // 這裡為了演示，我們只針對有數據的時間點進行分析
        // Mock Data 目前每個時間點都有資料
        timePoints.forEach(tp => {
            const stats = analyzeHitRates(races, tp);
            analysisResults.push({ timePoint: tp, stats });
        });

        // 3. 新增分析：落飛異動 & Q結構
        const moverStats: MoverStats[] = analyzeBigMovers(races);
        const quinellaStats: QuinellaStats[] = analyzeQuinellaComposition(races);

        // 4. 渲染頁面
        res.render('index', { 
            racesCount: races.length,
            results: analysisResults,
            moverStats,
            quinellaStats,
            lastUpdated: new Date().toLocaleString(),
            serverVersion: VERSION
        });

    } catch (error: any) {
        console.error('Error:', error);
        res.status(500).send(`Server Error: ${error.message}`);
    }
});

app.get('/odds', (req, res) => {
    res.render('odds');
});

// New Route for Horse Profile
app.get('/horse/:horseId', async (req, res) => {
    const horseId = req.params.horseId;
    if (!horseId) {
        return res.status(400).send('Horse ID is required');
    }

    try {
        // 1. Try to get from DB first
        let profile = null;
        try {
            profile = await getHorseProfileFromDb(horseId);
        } catch (dbError) {
            console.warn(`Warning: Failed to fetch profile from DB for ${horseId}. Continuing to scrape...`, dbError);
        }
        
        // 2. If not in DB or missing key info (e.g. no origin), scrape it
        if (!profile || !profile.origin) {
            console.log(`Profile for ${horseId} missing or incomplete in DB. Scraping live...`);
            profile = await scrapeHorseProfile(horseId);
            // Save to DB for next time
            try {
                await updateHorseProfileInDb(profile);
            } catch (dbSaveError) {
                console.warn(`Warning: Failed to save profile to DB for ${horseId}.`, dbSaveError);
            }
        }

        res.render('horse', {
            horseId: horseId,
            horseName: profile.name,
            records: profile.records,
            profile: profile
        });
    } catch (error) {
        console.error('Error fetching horse profile:', error);
        res.status(500).send(`Error fetching profile for horse ${horseId}: ${error instanceof Error ? error.message : String(error)}`);
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
