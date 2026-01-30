import 'dotenv/config';
import express from 'express';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { fetchRaceTrends } from './apiClient';
import { analyzeHitRates, analyzeBigMovers, analyzeQuinellaComposition } from './trendAnalysis';
import { HitRateStats, TimePoint, MoverStats, QuinellaStats } from './types';
import { scrapeTodayRacecard, ScrapeResult, HKJC_HEADERS, RaceHorseInfo, scrapeHorseProfile, calculateDetailedStats, HorsePerformanceRow, HorseStats } from './hkjcScraper';
import { saveScrapeResultToDb, updateHorseProfileInDb, getHorseProfileFromDb } from './services/dbService';
import { fetchOdds, saveOddsHistory } from './services/oddsService';
import { startScheduler } from './services/schedulerService';
import { updateAllHorseProfiles } from './services/profileService';
import { ScoringEngine, RaceContext, RaceEntryContext, ScoringConfig, HorseScore } from './services/scoringEngine';
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

// Helper to parse weights from Query Params
function parseScoringConfig(query: any): ScoringConfig | undefined {
    if (!query.w_form) return undefined; // No weights provided

    return {
        weights: {
            form: parseFloat(query.w_form) || 0,
            jockey: parseFloat(query.w_jockey) || 0,
            courseDistance: parseFloat(query.w_cd) || 0,
            trackwork: parseFloat(query.w_track) || 0,
            draw: parseFloat(query.w_draw) || 0,
            class: parseFloat(query.w_class) || 0,
            rating: parseFloat(query.w_rating) || 0,
            partnership: parseFloat(query.w_partner) || 0,
            barrierTrial: parseFloat(query.w_trial) || 0
        },
        subWeights: {
            form: {
                win: parseFloat(query.sw_form_win) || 100,
                place2: parseFloat(query.sw_form_p2) || 80,
                place3: parseFloat(query.sw_form_p3) || 60,
                place4: parseFloat(query.sw_form_p4) || 40,
                place5_6: parseFloat(query.sw_form_p56) || 20
            },
            jockey: {
                recentFormWeight: parseFloat(query.sw_jockey_recent) || 0.6,
                historyWeight: parseFloat(query.sw_jockey_hist) || 0.4
            },
            trackwork: {
                fastWork: parseFloat(query.sw_track_fast) || 15,
                slowWork: parseFloat(query.sw_track_slow) || 5,
                trotWork: parseFloat(query.sw_track_trot) || 10
            },
            class: {
                dropper: parseFloat(query.sw_class_drop) || 90,
                riser: parseFloat(query.sw_class_rise) || 30,
                same: parseFloat(query.sw_class_same) || 50
            },
            rating: {
                belowWin: parseFloat(query.sw_rating_below) || 90,
                nearWin: parseFloat(query.sw_rating_near) || 60,
                aboveWin: parseFloat(query.sw_rating_above) || 30
            }
        },
        daysLookback: parseInt(query.days) || 21
    };
}

function normalizeVenue(venue: string | null | undefined): string {
    if (!venue) return 'ST';
    if (venue.includes('Happy Valley') || venue.includes('跑馬地') || venue === 'HV') return 'HV';
    return 'ST';
}

app.get('/api/analysis/score/:raceId', async (req, res) => {
    try {
        const { raceId } = req.params;
        const config = parseScoringConfig(req.query);
        
        // If raceId is HKJC format (e.g. 20260201-ST-1)
        const race = await prisma.race.findUnique({
            where: { hkjcId: raceId },
            include: { results: true }
        });
        
        let entries: RaceEntryContext[] = [];
        let raceContext: RaceContext | undefined;
        
        if (race) {
            raceContext = {
                course: normalizeVenue(race.venue), 
                distance: race.distance || 1200, 
                trackType: race.trackType || 'Turf',
                courseType: race.course || undefined // e.g. "Turf - A Course"
            };

            const names = race.results.map(r => r.horseName).filter(n => n !== null) as string[];
            const horses = await prisma.horse.findMany({
                where: { name: { in: names } },
                select: { id: true, name: true }
            });
            
            const horseMap = new Map(horses.map(h => [h.name, h.id]));

            race.results.forEach(r => {
                if (r.horseName && horseMap.has(r.horseName)) {
                    entries.push({
                        horseId: horseMap.get(r.horseName)!,
                        jockey: r.jockey || '',
                        trainer: r.trainer || '',
                        draw: r.draw ? parseInt(r.draw) : undefined,
                        rating: r.rating ? parseInt(r.rating) : undefined,
                        class: race.class || undefined
                    });
                }
            });
        } 

        if (entries.length === 0) {
             return res.status(404).json({ error: "No horses found for this race. Ensure race is scraped." });
        }

        const engine = new ScoringEngine(config);
        const scores = await engine.analyzeRace(entries, raceContext);


        // Enrich scores with race-specific data (Draw, Weight, etc.)
        const enrichedScores = scores.map(score => {
            const result = race?.results.find(r => r.horseName === score.horseName);
            return {
                ...score,
                horseNo: result?.horseNo,
                draw: result?.draw,
                weight: result?.weight,
                rating: result?.rating,
                ratingChange: result?.ratingChange,
                gear: result?.gear
            };
        });

        res.json({
            raceId,
            scores: enrichedScores
        });

    } catch (e: any) {
        console.error('Analysis error:', e);
        res.status(500).json({ error: e.message });
    }
});

// View: Race Analysis Page
app.get('/analysis/race/:raceId', async (req, res) => {
    try {
        const { raceId } = req.params;
        const config = parseScoringConfig(req.query);
        
        // If raceId is HKJC format (e.g. 20260201-ST-1)
        const race = await prisma.race.findUnique({
            where: { hkjcId: raceId },
            include: { results: true }
        });
        
        let entries: RaceEntryContext[] = [];
        let raceContext: RaceContext | undefined;
        
        if (race) {
            raceContext = {
                course: normalizeVenue(race.venue || ''), 
                distance: race.distance || 1200, 
                trackType: race.trackType || 'Turf',
                courseType: race.course || undefined
            };

            const names = race.results.map(r => r.horseName).filter(n => n !== null) as string[];
            const horses = await prisma.horse.findMany({
                where: { name: { in: names } },
                select: { id: true, name: true }
            });
            
            const horseMap = new Map(horses.map(h => [h.name, h.id]));

            race.results.forEach(r => {
                if (r.horseName && horseMap.has(r.horseName)) {
                    entries.push({
                        horseId: horseMap.get(r.horseName)!,
                        jockey: r.jockey || '',
                        trainer: r.trainer || '',
                        draw: r.draw ? parseInt(r.draw) : undefined,
                        rating: r.rating ? parseInt(r.rating) : undefined,
                        class: race.class || undefined
                    });
                }
            });
        } 

        if (entries.length === 0) {
             return res.status(404).send("No horses found for this race. Please ensure the race has been scraped.");
        }

        const engine = new ScoringEngine(config);
        const scores = await engine.analyzeRace(entries, raceContext);

        // Enrich scores
        const enrichedScores = scores.map(score => {
            const result = race?.results.find(r => r.horseName === score.horseName);
            return {
                ...score,
                horseNo: result?.horseNo,
                draw: result?.draw,
                weight: result?.weight,
                rating: result?.rating,
                ratingChange: result?.ratingChange,
                gear: result?.gear
            };
        });

        // Use configured or default weights
        const weights = config?.weights || {
             form: 0.20, jockey: 0.15, courseDistance: 0.15, trackwork: 0.10, 
             draw: 0.10, class: 0.10, rating: 0.10, partnership: 0.05, barrierTrial: 0.05
        };

        const subWeights = config?.subWeights || {
            form: { win: 100, place2: 80, place3: 60, place4: 40, place5_6: 20 },
            jockey: { recentFormWeight: 0.6, historyWeight: 0.4 },
            trackwork: { fastWork: 15, slowWork: 5, trotWork: 10 },
            class: { dropper: 90, riser: 30, same: 50 },
            rating: { belowWin: 90, nearWin: 60, aboveWin: 30 }
        };

        // Reconstruct query string for links
        const queryParams = new URLSearchParams();
        Object.entries(weights).forEach(([k, v]) => {
            const keyMap: any = { courseDistance: 'w_cd', trackwork: 'w_track', partnership: 'w_partner', barrierTrial: 'w_trial' };
            const key = keyMap[k] || `w_${k}`;
            queryParams.append(key, v.toString());
        });
        // We also need to pass subWeights if they exist in config, otherwise defaults might be okay,
        // but consistency is better.
        if (config?.subWeights) {
            Object.entries(subWeights.form).forEach(([k, v]) => queryParams.append(k === 'place5_6' ? 'sw_form_p56' : (k === 'win' ? 'sw_form_win' : `sw_form_p${k.replace('place', '')}`), v.toString()));
            Object.entries(subWeights.jockey).forEach(([k, v]) => queryParams.append(k === 'recentFormWeight' ? 'sw_jockey_recent' : 'sw_jockey_hist', v.toString()));
            Object.entries(subWeights.trackwork).forEach(([k, v]) => queryParams.append(k === 'fastWork' ? 'sw_track_fast' : (k === 'trotWork' ? 'sw_track_trot' : 'sw_track_slow'), v.toString()));
            Object.entries(subWeights.class).forEach(([k, v]) => queryParams.append(`sw_class_${k}`, v.toString()));
            Object.entries(subWeights.rating).forEach(([k, v]) => queryParams.append(`sw_rating_${k.replace('Win', '')}`, v.toString()));
        }
        const queryString = queryParams.toString();

        // Render view
        res.render('analysis', {
            raceId,
            raceNo: race?.raceNo || '?',
            venue: race?.venue || 'ST',
            distance: race?.distance || '?',
            course: race?.course || '?',
            scores: enrichedScores,
            weights: weights, // Pass weights to view
            subWeights: subWeights, // Pass sub-weights
            queryString // Pass query string
        });

    } catch (e: any) {
        console.error('Analysis View error:', e);
        res.status(500).send(`Error generating analysis: ${e.message}`);
    }
});

// Detailed Factor Analysis Page
app.get('/analysis/race/:raceId/factor/:factor', async (req, res) => {
    try {
        const { raceId, factor } = req.params;
        const config = parseScoringConfig(req.query);

        // Get race data directly using HKJC ID (consistent with main analysis route)
        const race = await prisma.race.findUnique({
            where: { hkjcId: raceId },
            include: { results: true }
        });

        // Prepare entries (reuse logic)
        const entries: any[] = [];
        let raceContext: any = undefined;
        if (race) {
            raceContext = {
                course: normalizeVenue(race.venue || ''), 
                distance: race.distance || 1200, 
                trackType: race.trackType || 'Turf',
                courseType: race.course || undefined
            };
            const names = race.results.map((r: any) => r.horseName).filter((n: any) => n !== null) as string[];
            const horses = await prisma.horse.findMany({ where: { name: { in: names } }, select: { id: true, name: true } });
            const horseMap = new Map(horses.map(h => [h.name, h.id]));
            race.results.forEach((r: any) => {
                if (r.horseName && horseMap.has(r.horseName)) {
                    entries.push({
                        horseId: horseMap.get(r.horseName)!,
                        jockey: r.jockey || '',
                        trainer: r.trainer || '',
                        draw: r.draw ? parseInt(r.draw) : undefined,
                        rating: r.rating ? parseInt(r.rating) : undefined,
                        class: race.class || undefined
                    });
                }
            });
        }

        if (entries.length === 0) return res.status(404).send("No horses found.");

        const engine = new ScoringEngine(config);
        const scores = await engine.analyzeRace(entries, raceContext);

        // Map factor to friendly name and key
        const factorMap: any = {
            'form': { name: '往績', key: 'formScore', detailKey: 'form' },
            'jockey': { name: '騎師', key: 'jockeyScore', detailKey: 'jockey' },
            'trackwork': { name: '晨操', key: 'trackworkScore', detailKey: 'trackwork' },
            'draw': { name: '檔位', key: 'drawScore', detailKey: 'draw' },
            'courseDistance': { name: '路程', key: 'courseDistScore', detailKey: 'courseDist' },
            'class': { name: '班次', key: 'classScore', detailKey: 'class' },
            'rating': { name: '評分', key: 'ratingScore', detailKey: 'rating' },
            'partnership': { name: '拍檔', key: 'partnershipScore', detailKey: 'partnership' },
            'barrierTrial': { name: '試閘', key: 'trialScore', detailKey: 'trial' }
        };

        const currentFactor = factorMap[factor];
        if (!currentFactor) return res.status(404).send("Invalid factor");

        // Prepare data for view
        const factorData = scores.map((s: HorseScore) => {
            const result = race?.results.find((r: any) => r.horseName === s.horseName);
            return {
                horseNo: result?.horseNo,
                horseName: s.horseName,
                totalScore: s.totalScore,
                factorScore: (s.breakdown as any)[currentFactor.key],
                details: (s.breakdown.details as any)[currentFactor.detailKey]
            };
        }).sort((a, b) => b.factorScore - a.factorScore); // Sort by factor score

        // Weights
        const weights = config?.weights || {
             form: 0.20, jockey: 0.15, courseDistance: 0.15, trackwork: 0.10, 
             draw: 0.10, class: 0.10, rating: 0.10, partnership: 0.05, barrierTrial: 0.05
        };
        const subWeights = config?.subWeights || {
            form: { win: 100, place2: 80, place3: 60, place4: 40, place5_6: 20 },
            jockey: { recentFormWeight: 0.6, historyWeight: 0.4 },
            trackwork: { fastWork: 15, slowWork: 5, trotWork: 10 },
            class: { dropper: 90, riser: 30, same: 50 },
            rating: { belowWin: 90, nearWin: 60, aboveWin: 30 }
        };

        // Reconstruct query string for navigation
        const queryParams = new URLSearchParams();
        // Main weights
        Object.entries(weights).forEach(([k, v]) => {
            const keyMap: any = { courseDistance: 'w_cd', trackwork: 'w_track', partnership: 'w_partner', barrierTrial: 'w_trial' };
            const key = keyMap[k] || `w_${k}`;
            queryParams.append(key, v.toString());
        });
        // Sub weights (flatten)
        Object.entries(subWeights.form).forEach(([k, v]) => queryParams.append(k === 'place5_6' ? 'sw_form_p56' : (k === 'win' ? 'sw_form_win' : `sw_form_p${k.replace('place', '')}`), v.toString()));
        Object.entries(subWeights.jockey).forEach(([k, v]) => queryParams.append(k === 'recentFormWeight' ? 'sw_jockey_recent' : 'sw_jockey_hist', v.toString()));
        Object.entries(subWeights.trackwork).forEach(([k, v]) => queryParams.append(k === 'fastWork' ? 'sw_track_fast' : (k === 'trotWork' ? 'sw_track_trot' : 'sw_track_slow'), v.toString()));
        Object.entries(subWeights.class).forEach(([k, v]) => queryParams.append(`sw_class_${k}`, v.toString()));
        Object.entries(subWeights.rating).forEach(([k, v]) => queryParams.append(`sw_rating_${k.replace('Win', '')}`, v.toString()));
        
        const queryString = queryParams.toString();

        res.render('analysis-factor', {
            raceId,
            raceNo: race?.raceNo,
            venue: race?.venue,
            factor,
            factorName: currentFactor.name,
            data: factorData,
            weights,
            subWeights,
            queryString // Pass to view
        });

    } catch (e: any) {
        console.error('Factor View error:', e);
        res.status(500).send(`Error: ${e.message}`);
    }
});

app.get('/horse/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let profile = await getHorseProfileFromDb(id);
        
        if (!profile) {
            console.log(`Profile for ${id} not found in DB, scraping live...`);
            profile = await scrapeHorseProfile(id);
            // Save to DB in background
            updateHorseProfileInDb(profile).catch(err => console.error('Background profile save error:', err));
        }

        if (!profile) {
            return res.status(404).send('Horse profile not found');
        }

        res.render('horse', {
            horseId: profile.id,
            horseName: profile.name,
            profile: profile,
            records: profile.records,
            serverVersion: VERSION
        });
    } catch (error: any) {
        console.error(`Error loading horse profile:`, error);
        res.status(500).send(`Error loading profile: ${error.message}`);
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
        
        // Strategy:
        // 1. If date provided, force scrape (or fetch from DB for that date)
        // 2. If no date, try memory (lastScrapeResult)
        // 3. If memory empty, try DB (fetchLatestRaceDataFromDb)
        // 4. If DB empty, scrape live
        
        if (date) {
             // For now, force scrape if date is specific (TODO: Check DB first)
             console.log(`Scraping for specific date: ${date}`);
             lastScrapeResult = await scrapeTodayRacecard(date);
             lastScrapeError = null;
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

app.get('/analysis', async (req, res) => {
    try {
        // Fallback to DB if memory is empty
        if (!lastScrapeResult) {
            console.log('Memory empty, fetching latest data from DB...');
            lastScrapeResult = await fetchLatestRaceDataFromDb();
        }

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
        // 1. Get Recent Races from DB for Overview
        const recentRaces = await prisma.race.findMany({
            orderBy: [
                { date: 'desc' },
                { raceNo: 'asc' }
            ],
            take: 20
        });

        // Group by Date
        const groupedRaces: Record<string, typeof recentRaces> = {};
        recentRaces.forEach(race => {
            if (!groupedRaces[race.date]) {
                groupedRaces[race.date] = [];
            }
            groupedRaces[race.date].push(race);
        });

        // 2. 獲取數據 (目前使用 Mock) - Keep existing trend logic for now or minimize it
        // TODO: 上線時將 useMock 改為 false，並確認 API_BASE_URL
        const useMock = true;
        const races = await fetchRaceTrends(undefined, useMock);

        // ... (rest of trend analysis) ...
        const timePoints: TimePoint[] = ["30'", "15'", "10'", "5'", "0'"];
        const analysisResults: { timePoint: TimePoint; stats: HitRateStats }[] = [];
        timePoints.forEach(tp => {
            const stats = analyzeHitRates(races, tp);
            analysisResults.push({ timePoint: tp, stats });
        });
        const moverStats: MoverStats[] = analyzeBigMovers(races);
        const quinellaStats: QuinellaStats[] = analyzeQuinellaComposition(races);

        // 4. Render Page
        res.render('index', { 
            groupedRaces, // New: Pass grouped races
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
app.get('/horse', (req, res) => {
    // Redirect to home or show a search prompt
    res.redirect('/'); 
});

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
        
        // 2. If not in DB or missing key info (e.g. no origin or stakes), scrape it
        if (!profile || !profile.origin || !profile.totalStakes) {
            console.log(`Profile for ${horseId} missing or incomplete in DB (Stakes/Origin). Scraping live...`);
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
