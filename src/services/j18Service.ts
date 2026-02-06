import prisma from '../lib/prisma';
import { J18TrendResponse, J18LikeResponse, J18PayoutResponse, J18PayoutItem, ParsedPayout } from '../types/j18';

// Helper to fetch JSON from URL
async function fetchJson<T>(url: string): Promise<T | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to fetch ${url}: ${response.statusText}`);
            return null;
        }
        return await response.json() as T;
    } catch (error) {
        console.error(`Error fetching ${url}:`, error);
        return null;
    }
}

// Find Race by Date and RaceNo
// Note: J18 URLs use YYYY-MM-DD. Our DB stores YYYY-MM-DD.
async function findRace(date: string, raceNo: number) {
    // We assume the venue is correct if the date and race number match.
    // Since HK usually has only one meeting per day, this should be safe.
    const race = await prisma.race.findFirst({
        where: {
            date: date,
            raceNo: raceNo
        }
    });
    return race;
}

export async function scrapeAndSaveJ18Trend(date: string) {
    const url = `https://api.j18.hk/calculate/v1/trend?date=${date}`;
    console.log(`Fetching J18 Trend from ${url}...`);
    
    const data = await fetchJson<J18TrendResponse>(url);
    if (!data || data.code !== 0 || !data.data || !data.data.data) {
        console.warn(`No valid trend data found for ${date}`);
        return;
    }

    const racesData = data.data.data; // Key is race number string "1", "2"...

    for (const [raceNoStr, timePoints] of Object.entries(racesData)) {
        const raceNo = parseInt(raceNoStr);
        const race = await findRace(date, raceNo);
        
        if (!race) {
            console.warn(`Race not found in DB: ${date} Race ${raceNo}`);
            continue;
        }

        // Save Trend Data
        await prisma.j18Trend.upsert({
            where: { raceId: race.id },
            update: {
                trends: timePoints as any,
                updatedAt: new Date()
            },
            create: {
                raceId: race.id,
                trends: timePoints as any
            }
        });
        console.log(`Saved J18 Trend for Race ${raceNo}`);
    }
}

export async function scrapeAndSaveJ18Like(date: string) {
    const url = `https://api.j18.hk/calculate/v1/like?date=${date}`;
    console.log(`Fetching J18 Like from ${url}...`);
    
    const data = await fetchJson<J18LikeResponse>(url);
    if (!data || data.code !== 0 || !data.data || !data.data.data) {
        console.warn(`No valid like data found for ${date}`);
        return;
    }

    const racesData = data.data.data;

    for (const [raceNoStr, recommendations] of Object.entries(racesData)) {
        const raceNo = parseInt(raceNoStr);
        const race = await findRace(date, raceNo);
        
        if (!race) {
            console.warn(`Race not found in DB: ${date} Race ${raceNo}`);
            continue;
        }

        await prisma.j18Like.upsert({
            where: { raceId: race.id },
            update: {
                recommendations: recommendations as any,
                updatedAt: new Date()
            },
            create: {
                raceId: race.id,
                recommendations: recommendations as any
            }
        });
        console.log(`Saved J18 Like for Race ${raceNo}`);
    }
}

export async function scrapeAndSaveJ18Payout(date: string) {
    const url = `https://api.j18.hk/calculate/v1/payout?date=${date}`;
    console.log(`Fetching J18 Payout from ${url}...`);
    
    const data = await fetchJson<J18PayoutResponse>(url);
    if (!data || data.code !== 0 || !data.data || !data.data.data) {
        console.warn(`No valid payout data found for ${date}`);
        return;
    }

    const payoutsList = data.data.data;

    for (const item of payoutsList) {
        const raceNo = item.scene_num;
        const race = await findRace(date, raceNo);
        
        if (!race) {
            console.warn(`Race not found in DB: ${date} Race ${raceNo}`);
            continue;
        }

        let parsedPayouts: J18PayoutItem[] = [];
        try {
            parsedPayouts = JSON.parse(item.payout);
        } catch (e) {
            console.error(`Error parsing payout JSON for Race ${raceNo}:`, e);
            continue;
        }

        await prisma.j18Payout.upsert({
            where: { raceId: race.id },
            update: {
                payouts: parsedPayouts as any,
                updatedAt: new Date()
            },
            create: {
                raceId: race.id,
                payouts: parsedPayouts as any
            }
        });
        console.log(`Saved J18 Payout for Race ${raceNo}`);
    }
}
