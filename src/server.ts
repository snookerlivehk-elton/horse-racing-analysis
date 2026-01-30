import 'dotenv/config';
import express from 'express';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { scrapeTodayRacecard, ScrapeResult, HKJC_HEADERS, RaceHorseInfo, scrapeHorseProfile, calculateDetailedStats, HorsePerformanceRow, HorseStats } from './hkjcScraper';
import { saveScrapeResultToDb, updateHorseProfileInDb, getHorseProfileFromDb } from './services/dbService';
import { fetchOdds, saveOddsHistory } from './services/oddsService';
import { startScheduler } from './services/schedulerService';
import { updateAllHorseProfiles } from './services/profileService';
import { scrapeRaceTrackwork } from './services/trackworkScraper';
import { scrapeJockeyRanking, scrapeTrainerRanking, scrapePartnershipStats } from './services/statsScraper';
import { processMissingSectionals } from './services/sectionalScraper';
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
const VERSION = "1.6.5"; // Bump version to force update & confirm deployment

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
             // Determine Season Dates for Stats Calculation
             const rDate = new Date(r.date.replace(/\//g, '-')); 
             const rYear = rDate.getFullYear();
             const rMonth = rDate.getMonth(); // 0-11
             
             let startYear = rYear;
             if (rMonth < 8) { // Jan-Aug -> start year is previous year
                 startYear = rYear - 1;
             }
             const seasonStart = new Date(startYear, 8, 1); // Sept 1st
             const seasonEnd = new Date(startYear + 1, 6, 31); // July 31st

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
                    
                    let stats: HorseStats | undefined = undefined;
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

                         const thisRacePerf = horseProfile.performances.find(p => p.date === r.date && p.raceIndex === r.raceNo.toString());
                         const raceClass = thisRacePerf?.class || '';
                         const raceDist = thisRacePerf?.distance || '';
                         
                         stats = calculateDetailedStats(rows, {
                             seasonStart,
                             seasonEnd,
                             class: raceClass,
                             distance: raceDist,
                             venue: r.venue === 'HV' ? '跑馬地' : '沙田', 
                             location: r.venue === 'HV' ? '跑馬地' : '沙田',
                             jockey: res.jockey || ''
                         });

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
                        stats: stats,
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

import { DEFAULT_SCORING_CONFIG } from './constants/scoringDefaults';
import { ScoringEngine } from './services/scoringEngine';

app.get('/api/analysis/race/:raceId', async (req, res) => {
    try {
        const { raceId } = req.params;
        
        // 1. Get Config
        let configRecord = await prisma.scoringConfig.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' }
        });
        const config = configRecord ? (configRecord.config as any) : DEFAULT_SCORING_CONFIG;

        // 2. Run Engine
        const engine = new ScoringEngine(config);
        const scores = await engine.calculateRaceScore(raceId);

        res.json({ raceId, scores });
    } catch (e: any) {
        console.error('Analysis API Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Save Manual Adjustment
app.post('/api/scoring/adjust', async (req, res) => {
    try {
        const { raceId, horseNo, conditionScore, manualPoints } = req.body;
        
        if (!raceId || horseNo === undefined) {
            return res.status(400).json({ error: "Missing raceId or horseNo" });
        }

        const adjustment = await prisma.raceScoringAdjustment.upsert({
            where: {
                raceId_horseNo: {
                    raceId: raceId,
                    horseNo: parseInt(horseNo)
                }
            },
            update: {
                conditionScore: conditionScore !== undefined ? parseFloat(conditionScore) : undefined,
                manualPoints: manualPoints !== undefined ? parseFloat(manualPoints) : undefined
            },
            create: {
                raceId: raceId,
                horseNo: parseInt(horseNo),
                conditionScore: conditionScore !== undefined ? parseFloat(conditionScore) : undefined,
                manualPoints: manualPoints !== undefined ? parseFloat(manualPoints) : undefined
            }
        });

        res.json({ success: true, adjustment });
    } catch (e: any) {
        console.error('Adjustment save error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Export Analysis Results to Excel
app.get('/api/analysis/export/:raceId', async (req, res) => {
    try {
        const { raceId } = req.params;

        // 1. Get Race Info
        const race = await prisma.race.findUnique({ where: { hkjcId: raceId } });
        if (!race) return res.status(404).send("Race not found");

        // 2. Get Scores
        let configRecord = await prisma.scoringConfig.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' }
        });
        const config = configRecord ? (configRecord.config as any) : DEFAULT_SCORING_CONFIG;
        const engine = new ScoringEngine(config);
        const scores = await engine.calculateRaceScore(raceId);

        // 3. Build Excel
        const workbook = XLSX.utils.book_new();
        
        // Prepare Data
        const data: any[][] = [];
        
        // Headers
        const headers = ['Rank', 'Horse No', 'Horse Name', 'Total Score'];
        if (scores.length > 0) {
            Object.values(scores[0].breakdown).forEach((b: any) => {
                headers.push(b.factorLabel);
            });
        }
        data.push(headers);

        // Rows
        scores.forEach((s: any, index: number) => {
            const row = [
                index + 1,
                s.horseNo,
                s.horseName,
                s.totalScore.toFixed(1)
            ];
            Object.values(s.breakdown).forEach((b: any) => {
                row.push(b.weightedScore.toFixed(1));
            });
            data.push(row);
        });

        const sheet = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(workbook, sheet, "Analysis");

        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        const filename = `analysis-${race.date}-${race.venue}-R${race.raceNo}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);

    } catch (e: any) {
        console.error('Export error:', e);
        res.status(500).send(e.message);
    }
});

app.get('/analysis/race/:raceId', async (req, res) => {
    try {
        const { raceId } = req.params;

        // Fetch Race Info for Header
        const race = await prisma.race.findUnique({
            where: { hkjcId: raceId }
        });

        if (!race) {
            return res.status(404).send(`Race ${raceId} not found in DB. Please scrape first.`);
        }

        // Get Scores
        // Reuse logic or call internal function? Calling internal is better.
        // 1. Get Config
        let configRecord = await prisma.scoringConfig.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' }
        });
        const config = configRecord ? (configRecord.config as any) : DEFAULT_SCORING_CONFIG;

        // 2. Run Engine
        const engine = new ScoringEngine(config);
        const scores = await engine.calculateRaceScore(raceId);

        res.render('analysis', {
            race,
            scores,
            config
        });

    } catch (e: any) {
        console.error('Analysis View Error:', e);
        res.status(500).send(e.message);
    }
});

app.get('/api/config/scoring', async (req, res) => {
    try {
        let config = await prisma.scoringConfig.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' }
        });

        if (!config) {
            config = await prisma.scoringConfig.create({
                data: {
                    name: "Default Config",
                    config: DEFAULT_SCORING_CONFIG as any
                }
            });
        }
        res.json(config);
    } catch (e: any) {
        console.error('Config fetch error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/config/scoring', async (req, res) => {
    try {
        const { config, name } = req.body;
        if (!config) return res.status(400).json({ error: "Config body required" });

        const newConfig = await prisma.scoringConfig.create({
            data: {
                name: name || "Updated Config",
                config: config,
                isActive: true
            }
        });

        res.json(newConfig);
    } catch (e: any) {
        console.error('Config save error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/config', (req, res) => {
    res.render('config');
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
                return res.render('horse', { horse: newHorse });
            } catch (e) {
                return res.status(404).send(`Horse ${horseId} not found and scrape failed.`);
            }
        }
        
        res.render('horse', { horse });
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

// Stats Scraping Routes
app.post('/api/scrape/stats/general', async (req, res) => {
    try {
        console.log('Starting General Stats Scraping...');
        const jockeys = await scrapeJockeyRanking('Current');
        await scrapeTrainerRanking('Current');
        // Optionally scrape previous season too if needed
        // await scrapeJockeyRanking('Previous');
        // await scrapeTrainerRanking('Previous');
        
        res.json({ success: true, message: `Scraped stats for ${jockeys.length} jockeys and updated trainers.` });
    } catch (e: any) {
        console.error('General Stats Scrape Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/scrape/stats/partnership', async (req, res) => {
    try {
        const season = req.body.season || 'Current';
        console.log(`Starting Partnership Stats Scraping for ${season}...`);
        
        // Use non-blocking in background or blocking?
        // This is a long process. We should probably just start it and return "Started".
        // But for simplicity in this turn, I'll await it. If it times out, client should handle.
        // Or better, make it async fire-and-forget but log.
        
        // Since the user might want to know when it's done, I'll await it but with a caveat.
        // Actually, this might take minutes.
        // Let's await it for now as the list of jockeys isn't huge (~25 jockeys).
        
        await scrapePartnershipStats(season);
        
        res.json({ success: true, message: `Partnership stats scraping completed for ${season}` });
    } catch (e: any) {
        console.error('Partnership Stats Scrape Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/scrape/sectionals', async (req, res) => {
    try {
        console.log('Triggering Missing Sectionals Processing...');
        // Run in background to avoid timeout
        processMissingSectionals().catch(err => console.error('Background Sectional Scrape Error:', err));
        
        res.json({ success: true, message: "Sectional scraping started in background. Check server logs for progress." });
    } catch (e: any) {
        console.error('Sectional Scrape Trigger Error:', e);
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

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
