import prisma from '../lib/prisma';

export interface OddsDropMetrics {
    raceId: string;
    horseNo: number;
    dropRate: number; // (30min - 0min) / 30min * 100
    isSuddenDrop: boolean; // > 15% in last 3 mins
    dropSpeed5: number; // 5' -> 0' change rate
    
    // New Metrics
    odds30: number;
    odds5: number;
    odds0: number;
}

export interface FundFlowMetrics {
    raceId: string;
    horseNo: number;
    share0: number; // Betting share at T-0 (%)
    share5: number; // Betting share at T-5 (%)
    shareChange5: number; // share0 - share5
    isReverseMoney: boolean; // Odds Drop > 5% but Share Dropped
    hotMoneyRank: number; // Rank by Share0
}

export interface PunditPerfMetrics {
    raceId: string;
    picks: number[]; // Pundit's picks (Horse Nos)
    winnerPicked: boolean;
    winnerPickRank: number; // 1-based index (0 if not picked)
    top4PickedCount: number;
}

// Helper to find closest record to target time
function findClosestRecord(records: any[], targetTime: number) {
    if (!records.length) return null;
    return records.reduce((prev, curr) => 
        Math.abs(curr.timestamp.getTime() - targetTime) < Math.abs(prev.timestamp.getTime() - targetTime) ? curr : prev
    );
}

export async function calculateOddsDrops(raceId: string): Promise<OddsDropMetrics[]> {
    const race = await prisma.race.findUnique({
        where: { id: raceId },
        include: { oddsHistory: true }
    });

    if (!race || !race.oddsHistory || race.oddsHistory.length === 0) {
        return [];
    }

    const sortedHistory = race.oddsHistory.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    if (sortedHistory.length < 2) return [];

    // Determine Time Windows
    let time0 = sortedHistory[sortedHistory.length - 1].timestamp.getTime(); // Default to latest
    
    // If we have startTime, use it as T-0 reference, but clamp to available history
    if (race.startTime) {
        const raceStart = race.startTime.getTime();
        // If latest record is BEFORE race start, use latest. 
        // If latest record is AFTER race start, find the one closest to race start (T-0).
        if (sortedHistory[sortedHistory.length - 1].timestamp.getTime() > raceStart) {
             const closeRec = findClosestRecord(sortedHistory, raceStart);
             if (closeRec) time0 = closeRec.timestamp.getTime();
        }
    }

    const time30 = time0 - 30 * 60 * 1000;
    const time5 = time0 - 5 * 60 * 1000;
    const time3 = time0 - 3 * 60 * 1000;

    const rec0 = findClosestRecord(sortedHistory, time0);
    const rec30 = findClosestRecord(sortedHistory, time30);
    const rec5 = findClosestRecord(sortedHistory, time5);
    const rec3 = findClosestRecord(sortedHistory, time3);

    if (!rec0 || !rec30) return [];

    const odds0Map = (rec0.winOdds as Record<string, number>) || {};
    const odds30Map = (rec30.winOdds as Record<string, number>) || {};
    const odds5Map = (rec5 ? rec5.winOdds : {}) as Record<string, number>;
    const odds3Map = (rec3 ? rec3.winOdds : {}) as Record<string, number>;

    const results: OddsDropMetrics[] = [];
    const horses = Object.keys(odds0Map);

    for (const h of horses) {
        const o0 = odds0Map[h];
        const o30 = odds30Map[h] || o0; // Fallback if missing
        const o5 = odds5Map[h] || o0;
        const o3 = odds3Map[h] || o0;

        const dropRate = ((o30 - o0) / o30) * 100;
        const dropSpeed5 = ((o5 - o0) / o5) * 100;
        
        let isSuddenDrop = false;
        if (o3 > 0) {
             const drop3 = ((o3 - o0) / o3) * 100;
             if (drop3 > 15) isSuddenDrop = true;
        }

        results.push({
            raceId,
            horseNo: parseInt(h),
            dropRate,
            isSuddenDrop,
            dropSpeed5,
            odds30: o30,
            odds5: o5,
            odds0: o0
        });
    }

    return results;
}

export async function calculateFundFlow(raceId: string): Promise<FundFlowMetrics[]> {
    const race = await prisma.race.findUnique({
        where: { id: raceId },
        include: { oddsHistory: true }
    });

    if (!race || !race.oddsHistory || race.oddsHistory.length < 2) return [];

    const sortedHistory = race.oddsHistory.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Use same T-0 / T-5 logic
    let time0 = sortedHistory[sortedHistory.length - 1].timestamp.getTime();
    if (race.startTime) {
        const raceStart = race.startTime.getTime();
        if (sortedHistory[sortedHistory.length - 1].timestamp.getTime() > raceStart) {
             const closeRec = findClosestRecord(sortedHistory, raceStart);
             if (closeRec) time0 = closeRec.timestamp.getTime();
        }
    }
    const time5 = time0 - 5 * 60 * 1000;

    const rec0 = findClosestRecord(sortedHistory, time0);
    const rec5 = findClosestRecord(sortedHistory, time5);
    
    if (!rec0 || !rec5) return [];

    const getShares = (oddsMap: Record<string, number>) => {
        const shares: Record<string, number> = {};
        let totalImplied = 0;
        for (const h in oddsMap) {
            if (oddsMap[h] > 0) totalImplied += 1 / oddsMap[h];
        }
        for (const h in oddsMap) {
            if (oddsMap[h] > 0) shares[h] = (1 / oddsMap[h]) / totalImplied * 100;
        }
        return shares;
    };

    const shares0 = getShares(rec0.winOdds as Record<string, number>);
    const shares5 = getShares(rec5.winOdds as Record<string, number>);
    const odds0 = rec0.winOdds as Record<string, number>;
    const odds5 = rec5.winOdds as Record<string, number>;

    const results: FundFlowMetrics[] = [];
    
    // Sort horses by Share0 to get Hot Money Rank
    const sortedHorses = Object.keys(shares0).sort((a, b) => shares0[b] - shares0[a]);

    for (const hStr of sortedHorses) {
        const s0 = shares0[hStr] || 0;
        const s5 = shares5[hStr] || 0;
        const o0 = odds0[hStr] || 0;
        const o5 = odds5[hStr] || 0;

        const shareChange5 = s0 - s5;
        
        // Reverse Money: Odds Dropped (DropRate > 5%) BUT Share Dropped (Change < -0.5%)
        // Meaning price shortened but money actually flowed OUT (relatively)
        const dropRate5 = ((o5 - o0) / o5) * 100;
        const isReverseMoney = dropRate5 > 5 && shareChange5 < -0.5;

        results.push({
            raceId,
            horseNo: parseInt(hStr),
            share0: s0,
            share5: s5,
            shareChange5,
            isReverseMoney,
            hotMoneyRank: sortedHorses.indexOf(hStr) + 1
        });
    }

    return results;
}

export async function calculatePunditPerf(raceId: string): Promise<PunditPerfMetrics | null> {
    const race = await prisma.race.findUnique({
        where: { id: raceId },
        include: { j18Likes: true, results: true }
    });

    if (!race || !race.j18Likes.length || !race.results.length) return null;

    // Assume 1st J18Like record is the main pundit source
    const likes = race.j18Likes[0].recommendations as number[]; // [1, 5, 2]
    if (!likes || !Array.isArray(likes)) return null;

    const winner = race.results.find(r => r.place === 1);
    const top4 = race.results.filter(r => r.place && r.place <= 4).map(r => r.horseNo);

    if (!winner) return null;

    const winnerPicked = likes.includes(winner.horseNo);
    const winnerPickRank = likes.indexOf(winner.horseNo) + 1;
    
    let top4PickedCount = 0;
    for (const pick of likes) {
        if (top4.includes(pick)) top4PickedCount++;
    }

    return {
        raceId,
        picks: likes,
        winnerPicked,
        winnerPickRank,
        top4PickedCount
    };
}
