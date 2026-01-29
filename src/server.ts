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

const app = express();
const PORT = process.env.PORT || 3000;

// Start Scheduler
startScheduler();
const VERSION = "1.6.3"; // Added Profile Service

let lastScrapeResult: ScrapeResult | null = null;
let lastScrapeError: string | null = null;

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
        let profile = await getHorseProfileFromDb(horseId);
        
        // 2. If not in DB or missing key info (e.g. no origin), scrape it
        if (!profile || !profile.origin) {
            console.log(`Profile for ${horseId} missing or incomplete in DB. Scraping live...`);
            profile = await scrapeHorseProfile(horseId);
            // Save to DB for next time
            await updateHorseProfileInDb(profile);
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
