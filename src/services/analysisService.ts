
import prisma from '../lib/prisma';
import { J18PayoutItem } from '../types/j18';

interface SystemStats {
    totalRaces: number;
    top1WinCount: number;
    top1PlaceCount: number;
    top2QCount: number; // Quinella (1st & 2nd match result's 1st & 2nd)
    top1WinYield: number; // Net profit/loss based on $10 unit bet
    roi: number; // Return on Investment %
}

interface TrendAnalysis {
    horseNo: number;
    rank30: number;
    rank0: number;
    rankChange: number; // rank30 - rank0
    isBigMover: boolean; // change >= 5
    isSteadyFavorite: boolean; // always top 3
    result?: {
        place: number;
        winDividend?: number;
    };
}

export class AnalysisService {

    // Helper: Parse Winner and Placings from J18Payout
    private parseResults(payouts: J18PayoutItem[]) {
        let winner: number | null = null;
        let placings: number[] = [];
        let winDividend = 0;

        const winPool = payouts.find(p => p.name.includes('獨贏'));
        if (winPool && winPool.list.length > 0) {
            winner = parseInt(winPool.list[0].shengchuzuhe);
            winDividend = parseFloat(winPool.list[0].paicai);
        }

        const placePool = payouts.find(p => p.name.includes('位置'));
        if (placePool) {
            placings = placePool.list.map(item => parseInt(item.shengchuzuhe));
        }

        return { winner, placings, winDividend };
    }

    // 1. System Accuracy Statistics (J18 Like vs Result)
    async getSystemStats(startDate?: string, endDate?: string): Promise<SystemStats> {
        const whereClause: any = {};
        if (startDate && endDate) {
            whereClause.date = { gte: startDate, lte: endDate };
        }

        // Fetch races with Like and Payout data
        const races = await prisma.race.findMany({
            where: {
                ...whereClause,
                j18Likes: { some: {} },
                j18Payouts: { some: {} }
            },
            include: {
                j18Likes: true,
                j18Payouts: true
            }
        });

        let stats: SystemStats = {
            totalRaces: 0,
            top1WinCount: 0,
            top1PlaceCount: 0,
            top2QCount: 0,
            top1WinYield: 0,
            roi: 0
        };

        for (const race of races) {
            if (!race.j18Likes[0] || !race.j18Payouts[0]) continue;

            const recommendations = race.j18Likes[0].recommendations as unknown as number[]; // [1, 6, 13...]
            const payouts = race.j18Payouts[0].payouts as unknown as J18PayoutItem[];
            
            const { winner, placings, winDividend } = this.parseResults(payouts);

            if (!winner) continue;

            stats.totalRaces++;

            // Top 1 Analysis
            const top1Pick = recommendations[0];
            
            // Win
            if (top1Pick === winner) {
                stats.top1WinCount++;
                stats.top1WinYield += (winDividend - 10); // Profit = Dividend - Cost
            } else {
                stats.top1WinYield -= 10; // Loss
            }

            // Place
            if (placings.includes(top1Pick)) {
                stats.top1PlaceCount++;
            }

            // Top 2 Q Analysis (Did the Top 2 picks form the Quinella?)
            // Q means 1st and 2nd horses are the winners (any order)
            // Need to check if winner and 2nd place are in Top 2 picks
            // Actually, J18Payout for Q (連贏) tells us the winning combo.
            const qPool = payouts.find(p => p.name.includes('連贏'));
            if (qPool && qPool.list.length > 0) {
                // Q combo string "3,8"
                const qCombos = qPool.list.map(l => l.shengchuzuhe.split(',').map(Number));
                // Our picks: recommendations[0] and recommendations[1]
                const myPicks = [recommendations[0], recommendations[1]].sort();
                
                // Check if my picks match any winning Q combo
                const hitQ = qCombos.some(combo => {
                    const sortedCombo = combo.sort();
                    return sortedCombo[0] === myPicks[0] && sortedCombo[1] === myPicks[1];
                });

                if (hitQ) stats.top2QCount++;
            }
        }

        // Calculate ROI
        const totalInvestment = stats.totalRaces * 10;
        stats.roi = totalInvestment > 0 ? (stats.top1WinYield / totalInvestment) * 100 : 0;

        return stats;
    }

    // 2. Trend Analysis for a Specific Race
    async getRaceTrendAnalysis(raceId: string): Promise<TrendAnalysis[]> {
        const race = await prisma.race.findUnique({
            where: { id: raceId },
            include: {
                j18Trends: true,
                j18Payouts: true
            }
        });

        if (!race || !race.j18Trends[0]) return [];

        const trendsData = race.j18Trends[0].trends as unknown as Record<string, string[]>; // "30": ["1", "2"]
        const timePoints = Object.keys(trendsData).sort((a, b) => parseInt(b) - parseInt(a)); // 30, 15, 5, 0...
        
        if (timePoints.length === 0) return [];

        const startKey = timePoints.includes('30') ? '30' : timePoints[0];
        const endKey = timePoints.includes('0') ? '0' : timePoints[timePoints.length - 1];

        const startRanks = trendsData[startKey];
        const endRanks = trendsData[endKey];

        // Parse Results if available
        let winner: number | null = null;
        let placings: number[] = [];
        let winDividend = 0;

        if (race.j18Payouts[0]) {
             const res = this.parseResults(race.j18Payouts[0].payouts as unknown as J18PayoutItem[]);
             winner = res.winner;
             placings = res.placings;
             winDividend = res.winDividend;
        }

        // Get all unique horses involved
        const allHorses = new Set<string>();
        startRanks.forEach(h => allHorses.add(h));
        endRanks.forEach(h => allHorses.add(h));

        const analysis: TrendAnalysis[] = [];

        for (const horseStr of allHorses) {
            const horseNo = parseInt(horseStr);
            
            // Rank is index + 1
            const rankStart = startRanks.indexOf(horseStr) + 1 || 99; // 99 if missing
            const rankEnd = endRanks.indexOf(horseStr) + 1 || 99;

            // Metrics
            const rankChange = (rankStart !== 99 && rankEnd !== 99) ? (rankStart - rankEnd) : 0;
            const isBigMover = rankChange >= 5;
            
            // Steady Favorite: Must be in Top 3 at start and end (and ideally middle, but simplified here)
            const isSteadyFavorite = rankStart <= 3 && rankEnd <= 3;

            // Result
            let resultData = undefined;
            if (winner) {
                let place = 0;
                if (winner === horseNo) place = 1;
                else if (placings.includes(horseNo)) place = placings.indexOf(horseNo) + 2; // Approximate place

                resultData = {
                    place: place,
                    winDividend: (place === 1) ? winDividend : 0
                };
            }

            analysis.push({
                horseNo,
                rank30: rankStart,
                rank0: rankEnd,
                rankChange,
                isBigMover,
                isSteadyFavorite,
                result: resultData
            });
        }

        return analysis.sort((a, b) => a.rank0 - b.rank0); // Sort by final rank (popularity)
    }

    // 3. Hit Rate Statistics (Trend & Pundit vs Result)
    async getHitRateStats(startDate?: string, endDate?: string) {
        const whereClause: any = {};
        if (startDate && endDate) {
            whereClause.date = { gte: startDate, lte: endDate };
        }

        const races = await prisma.race.findMany({
            where: {
                ...whereClause,
                j18Payouts: { some: {} } // Must have results
            },
            include: {
                j18Likes: true,
                j18Trends: true,
                j18Payouts: true
            }
        });

        const stats = {
            totalRaces: 0,
            punditStats: { 
                winHit: 0, qHit: 0, tHit: 0, f4Hit: 0, count: 0,
                winYield: 0, qYield: 0, tYield: 0, f4Yield: 0
            },
            trendStats: {} as Record<string, { 
                winHit: number, qHit: number, tHit: number, f4Hit: number, count: number,
                winYield: number, qYield: number, tYield: number, f4Yield: number
            }>
        };

        for (const race of races) {
            if (!race.j18Payouts[0]) continue;
            
            const payouts = race.j18Payouts[0].payouts as unknown as J18PayoutItem[];
            const { winner, placings } = this.parseResults(payouts); // placings contains 2nd, 3rd, 4th...
            
            if (!winner) continue;

            // Helper to get dividend
            const getDividend = (name: string) => {
                const pool = payouts.find(p => p.name.includes(name));
                if (pool && pool.list.length > 0) {
                     const val = pool.list[0].paicai;
                     if (typeof val === 'string' && val !== '未能勝出') {
                         return parseFloat(val.replace(/,/g, ''));
                     }
                }
                return 0;
            };

            const winDiv = getDividend('獨贏');
            const qDiv = getDividend('連贏');
            const tDiv = getDividend('三重彩');
            const f4Div = getDividend('四重彩');

            // Re-parsing to get top 4 ranks
            const top4: number[] = [winner];
            let second: number | null = null;
            let third: number | null = null;
            let fourth: number | null = null;

            // Try to find exact placings from Tierce/First4 pools
            const tPool = payouts.find(p => p.name.includes('三重彩'));
            if (tPool && tPool.list.length > 0) {
                 const parts = tPool.list[0].shengchuzuhe.split(/[-+,]/).map(Number);
                 if (parts.length >= 3) {
                     second = parts[1];
                     third = parts[2];
                 }
            }

            const f4Pool = payouts.find(p => p.name.includes('四重彩') || p.name.includes('四連環'));
            if (f4Pool && f4Pool.list.length > 0) {
                 const parts = f4Pool.list[0].shengchuzuhe.split(/[-+,]/).map(Number);
                 if (parts.length >= 4) {
                     fourth = parts[3];
                     if (!second) second = parts[1];
                     if (!third) third = parts[2];
                 }
            }
            
            // Fallback: Use Placings from Place Pool
            if (!second && placings.length > 0) {
                const placesWithoutWinner = placings.filter(h => h !== winner);
                if (placesWithoutWinner.length > 0) second = placesWithoutWinner[0];
                if (placesWithoutWinner.length > 1) third = placesWithoutWinner[1];
            }

            // Check function
            const checkHits = (picks: number[]) => {
                const picksSet = new Set(picks);
                
                // Win: Top 2 picks contain Winner
                const winHit = picks.slice(0, 2).includes(winner);
                
                // Q: Top 3 picks contain Winner & Second
                const qHit = (second && picks.slice(0, 3).includes(winner) && picks.slice(0, 3).includes(second)) || false;
                
                // T: Top 4 picks contain Win, 2nd, 3rd
                const tHit = (second && third && 
                              picks.slice(0, 4).includes(winner) && 
                              picks.slice(0, 4).includes(second) && 
                              picks.slice(0, 4).includes(third)) || false;
                
                // F4: Top 6 picks contain Win, 2nd, 3rd, 4th
                const f4Hit = (second && third && fourth && 
                               picks.slice(0, 6).includes(winner) && 
                               picks.slice(0, 6).includes(second) && 
                               picks.slice(0, 6).includes(third) && 
                               picks.slice(0, 6).includes(fourth)) || false;
                               
                return { winHit, qHit, tHit, f4Hit };
            };

            stats.totalRaces++;

            // 1. Pundit Stats
            if (race.j18Likes[0]) {
                const picks = race.j18Likes[0].recommendations as unknown as number[];
                if (picks && picks.length > 0) {
                    const res = checkHits(picks);
                    stats.punditStats.count++;
                    if (res.winHit) { stats.punditStats.winHit++; stats.punditStats.winYield += winDiv; }
                    if (res.qHit) { stats.punditStats.qHit++; stats.punditStats.qYield += qDiv; }
                    if (res.tHit) { stats.punditStats.tHit++; stats.punditStats.tYield += tDiv; }
                    if (res.f4Hit) { stats.punditStats.f4Hit++; stats.punditStats.f4Yield += f4Div; }
                }
            }

            // 2. Trend Stats
            if (race.j18Trends[0]) {
                const trendsData = race.j18Trends[0].trends as unknown as Record<string, string[]>;
                Object.keys(trendsData).forEach(timeKey => {
                    const picks = trendsData[timeKey].map(Number);
                    if (picks.length > 0) {
                        if (!stats.trendStats[timeKey]) {
                            stats.trendStats[timeKey] = { 
                                winHit: 0, qHit: 0, tHit: 0, f4Hit: 0, count: 0,
                                winYield: 0, qYield: 0, tYield: 0, f4Yield: 0
                            };
                        }
                        
                        const res = checkHits(picks);
                        stats.trendStats[timeKey].count++;
                        if (res.winHit) { stats.trendStats[timeKey].winHit++; stats.trendStats[timeKey].winYield += winDiv; }
                        if (res.qHit) { stats.trendStats[timeKey].qHit++; stats.trendStats[timeKey].qYield += qDiv; }
                        if (res.tHit) { stats.trendStats[timeKey].tHit++; stats.trendStats[timeKey].tYield += tDiv; }
                        if (res.f4Hit) { stats.trendStats[timeKey].f4Hit++; stats.trendStats[timeKey].f4Yield += f4Div; }
                    }
                });
            }
        }

        return stats;
    }
}
