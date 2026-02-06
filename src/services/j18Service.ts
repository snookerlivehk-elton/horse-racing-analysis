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

// Find Race by Date and RaceNo, or create if missing (if venue provided)
async function ensureRace(date: string, raceNo: number, venue?: string) {
    let race = await prisma.race.findFirst({
        where: {
            date: date,
            raceNo: raceNo
        }
    });

    if (!race && venue) {
        const dateCompact = date.replace(/-/g, '');
        const hkjcId = `${dateCompact}-${venue}-${raceNo}`;
        
        try {
            race = await prisma.race.create({
                data: {
                    hkjcId,
                    date,
                    venue,
                    raceNo,
                }
            });
            console.log(`Created skeleton race: ${hkjcId}`);
        } catch (e: any) {
            // Handle race condition where race might be created by parallel process
            if (e.code === 'P2002') {
                 race = await prisma.race.findFirst({
                    where: { date, raceNo }
                });
            } else {
                console.error(`Failed to create race ${hkjcId}:`, e.message);
            }
        }
    }
    return race;
}

export async function scrapeAndSaveJ18Trend(date: string, venue?: string) {
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
        const race = await ensureRace(date, raceNo, venue);
        
        if (!race) {
            console.warn(`Race not found in DB and no venue provided to create it: ${date} Race ${raceNo}`);
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

export async function scrapeAndSaveJ18Like(date: string, venue?: string) {
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
        const race = await ensureRace(date, raceNo, venue);
        
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

export async function scrapeAndSaveJ18Payout(date: string, venue?: string) {
    const url = `https://api.j18.hk/calculate/v1/payout?date=${date}`;
    console.log(`Fetching J18 Payout from ${url}...`);
    
    const data = await fetchJson<J18PayoutResponse>(url);
    if (!data || data.code !== 0 || !data.data || !data.data.data) {
        console.warn(`No valid payout data found for ${date}`);
        return;
    }

    const racesData = data.data.data; // Array of items with scene_num

    for (const item of racesData) {
        const raceNo = item.scene_num;
        const race = await ensureRace(date, raceNo, venue);

        if (!race) {
            console.warn(`Race not found in DB: ${date} Race ${raceNo}`);
            continue;
        }

        const payoutData = JSON.parse(item.payout) as J18PayoutItem[];

        await prisma.j18Payout.upsert({
            where: { raceId: race.id },
            update: {
                payouts: payoutData as any,
                updatedAt: new Date()
            },
            create: {
                raceId: race.id,
                payouts: payoutData as any
            }
        });
        console.log(`Saved J18 Payout for Race ${raceNo}`);
    }
}
