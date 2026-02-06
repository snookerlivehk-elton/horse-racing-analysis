import prisma from '../lib/prisma';

export interface OddsDropMetrics {
    raceId: string;
    horseNo: number;
    dropRate: number; // (30min - 0min) / 30min * 100
    isSuddenDrop: boolean; // > 15% in last 3 mins
    dropSpeed5: number; // 5' -> 0' change rate
}

export async function calculateOddsDrops(raceId: string): Promise<OddsDropMetrics[]> {
    const race = await prisma.race.findUnique({
        where: { id: raceId },
        include: { oddsHistory: true }
    });

    if (!race || !race.oddsHistory || race.oddsHistory.length === 0) {
        return [];
    }

    // Sort history by timestamp
    const sortedHistory = race.oddsHistory.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (sortedHistory.length === 0) return [];

    // We need to approximate 30', 15', 5', 3', 0' relative to startTime
    // If startTime is not set, we might assume the last record is 0' (Close)
    // For now, let's assume we have timestamps and check against race.startTime if available, 
    // or just take the first available (earliest) as 30' proxy if we don't have enough history,
    // and last as 0'.
    
    // Ideally, we find the record closest to T-30m, T-5m, T-3m, T-0m.
    
    // For this MVP, let's take:
    // Start = Earliest record (approx 30m or whenever tracking started)
    // End = Latest record (approx 0m)
    // 5m = Record closest to End timestamp - 5 minutes
    
    const latest = sortedHistory[sortedHistory.length - 1];
    const earliest = sortedHistory[0];
    
    // If we only have 1 record, no drop.
    if (sortedHistory.length < 2) return [];

    const winOddsLatest = latest.winOdds as Record<string, number> || {};
    const winOddsEarliest = earliest.winOdds as Record<string, number> || {};
    
    // Find 5 min point (approx)
    const fiveMinTime = latest.timestamp.getTime() - 5 * 60 * 1000;
    const threeMinTime = latest.timestamp.getTime() - 3 * 60 * 1000;
    
    const record5m = sortedHistory.reduce((prev, curr) => 
        Math.abs(curr.timestamp.getTime() - fiveMinTime) < Math.abs(prev.timestamp.getTime() - fiveMinTime) ? curr : prev
    );
    
    const record3m = sortedHistory.reduce((prev, curr) => 
        Math.abs(curr.timestamp.getTime() - threeMinTime) < Math.abs(prev.timestamp.getTime() - threeMinTime) ? curr : prev
    );

    const winOdds5m = (record5m.winOdds as Record<string, number>) || {};
    const winOdds3m = (record3m.winOdds as Record<string, number>) || {};

    const results: OddsDropMetrics[] = [];
    
    // Get all horse numbers from latest odds
    const horses = Object.keys(winOddsLatest);

    for (const h of horses) {
        const odds0 = winOddsLatest[h];
        const odds30 = winOddsEarliest[h]; // Using earliest as proxy for 30 if available
        const odds5 = winOdds5m[h];
        const odds3 = winOdds3m[h];

        if (!odds0 || !odds30) continue;

        const dropRate = ((odds30 - odds0) / odds30) * 100;
        
        let dropSpeed5 = 0;
        if (odds5) {
             dropSpeed5 = ((odds5 - odds0) / odds5) * 100;
        }

        let isSuddenDrop = false;
        if (odds3) {
            const drop3 = ((odds3 - odds0) / odds3) * 100;
            if (drop3 > 15) isSuddenDrop = true;
        }

        results.push({
            raceId,
            horseNo: parseInt(h),
            dropRate,
            dropSpeed5,
            isSuddenDrop
        });
    }

    return results;
}
