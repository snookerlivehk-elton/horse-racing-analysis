
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
            winDividend = parseFloat(winPool.list[0].paicai.replace(/,/g, ''));
        }

        const placePool = payouts.find(p => p.name.includes('位置'));
        if (placePool) {
            placings = placePool.list.map(item => parseInt(item.shengchuzuhe));
        }

        return { winner, placings, winDividend };
    }

    // Helper: Calculate Rewards for a single race based on picks
    private calculateRaceRewards(payouts: J18PayoutItem[], picks: number[]) {
        const COSTS = { WIN: 20, Q: 30, T: 240, F4: 3600 };
        const res = {
            win: { hit: 0, rev: 0, cost: COSTS.WIN },
            q: { hit: 0, rev: 0, cost: COSTS.Q },
            t: { hit: 0, rev: 0, cost: COSTS.T },
            f4: { hit: 0, rev: 0, cost: COSTS.F4 }
        };
        
        // Helper to parse amount
        const parseAmt = (val: string) => {
            if (typeof val === 'string' && val !== '未能勝出') {
                return parseFloat(val.replace(/,/g, ''));
            }
            return 0;
        };
        
        // WIN (Top 2 picks)
        const winPool = payouts.find(p => p.name.includes('獨贏'));
        if (winPool) {
            const myPicks = new Set(picks.slice(0, 2));
            for (const item of winPool.list) {
                const winner = parseInt(item.shengchuzuhe);
                if (myPicks.has(winner)) {
                    res.win.hit = 1;
                    res.win.rev += parseAmt(item.paicai);
                }
            }
        }
        
        // Q (Top 3 Box)
        const qPool = payouts.find(p => p.name.includes('連贏'));
        if (qPool) {
            const myPicks = picks.slice(0, 3);
            for (const item of qPool.list) {
                const parts = item.shengchuzuhe.split(/[-+,]/).map(Number);
                // Q is any 2 horses. Check if both are in myPicks.
                if (parts.length >= 2 && parts.every(h => myPicks.includes(h))) {
                    res.q.hit = 1;
                    res.q.rev += parseAmt(item.paicai);
                }
            }
        }
        
        // T (Top 4 Box)
        const tPool = payouts.find(p => p.name.includes('三重彩')); // Tierce (ordered)
        if (tPool) {
            const myPicks = new Set(picks.slice(0, 4));
            for (const item of tPool.list) {
                const parts = item.shengchuzuhe.split(/[-+,]/).map(Number);
                // Box bet covers the combination regardless of order
                if (parts.length >= 3 && parts.every(h => myPicks.has(h))) {
                    res.t.hit = 1;
                    res.t.rev += parseAmt(item.paicai);
                }
            }
        }
        
        // F4 (Top 6 Box)
        // Prioritize First 4 (四重彩) over Quartet (四連環) as it pays more and matches "F4" better
        const f4Pool = payouts.find(p => p.name.includes('四重彩')) || payouts.find(p => p.name.includes('四連環'));
        if (f4Pool) {
            const myPicks = new Set(picks.slice(0, 6));
            for (const item of f4Pool.list) {
                const parts = item.shengchuzuhe.split(/[-+,]/).map(Number);
                if (parts.length >= 4 && parts.every(h => myPicks.has(h))) {
                    res.f4.hit = 1;
                    res.f4.rev += parseAmt(item.paicai);
                }
            }
        }
        
        return res;
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
            const startRank = startRanks.indexOf(horseStr) + 1;
            const endRank = endRanks.indexOf(horseStr) + 1;
            
            // Skip if not ranked in one of the snapshots (shouldn't happen if full list)
            if (startRank === 0 || endRank === 0) continue;

            const rankChange = startRank - endRank; // Positive means improved (e.g. 10 -> 5 = +5)
            const horseNo = parseInt(horseStr);

            analysis.push({
                horseNo,
                rank30: startRank,
                rank0: endRank,
                rankChange,
                isBigMover: rankChange >= 5,
                isSteadyFavorite: startRank <= 3 && endRank <= 3,
                result: winner ? {
                    place: winner === horseNo ? 1 : (placings.includes(horseNo) ? 0 : -1), // Simplified place
                    winDividend: winner === horseNo ? winDividend : 0
                } : undefined
            });
        }

        return analysis;
    }

    // 3. Hit Rate Analysis (Win/Q/T/F4)
    async getHitRateStats(startDate?: string, endDate?: string) {
        const whereClause: any = {};
        if (startDate && endDate) {
            whereClause.date = { gte: startDate, lte: endDate };
        }

        const races = await prisma.race.findMany({
            where: {
                ...whereClause,
                j18Likes: { some: {} },
                results: { some: {} }
            },
            include: {
                j18Likes: true,
                results: true
            }
        });

        const stats = {
            totalRaces: 0,
            win: { hits: 0, rate: 0 }, // Top 2 picks contain Winner
            q: { hits: 0, rate: 0 },   // Top 3 picks contain Top 2 (Q)
            t: { hits: 0, rate: 0 },   // Top 4 picks contain Top 3 (T)
            f4: { hits: 0, rate: 0 }   // Top 6 picks contain Top 4 (F4)
        };

        for (const race of races) {
            if (!race.j18Likes[0] || race.results.length === 0) continue;

            const picks = race.j18Likes[0].recommendations as number[];
            const results = race.results;

            // Get actual placings
            const winner = results.find(r => r.place === 1)?.horseNo;
            const top2 = results.filter(r => r.place && r.place <= 2).map(r => r.horseNo);
            const top3 = results.filter(r => r.place && r.place <= 3).map(r => r.horseNo);
            const top4 = results.filter(r => r.place && r.place <= 4).map(r => r.horseNo);

            if (!winner) continue; // Skip if no results

            stats.totalRaces++;

            // Win Hit: Winner in Top 2 picks
            // Logic: Is the winner present in the first 2 picks?
            if (picks.slice(0, 2).includes(winner)) {
                stats.win.hits++;
            }

            // Q Hit: Top 2 horses in Top 3 picks
            // Logic: Do the first 3 picks contain at least 2 horses from the actual Top 2?
            const qMatches = picks.slice(0, 3).filter(p => top2.includes(p));
            if (qMatches.length >= 2) {
                stats.q.hits++;
            }

            // T Hit: Top 3 horses in Top 4 picks
            // Logic: Do the first 4 picks contain at least 3 horses from the actual Top 3? (Boxed Tierce)
            const tMatches = picks.slice(0, 4).filter(p => top3.includes(p));
            if (tMatches.length >= 3) {
                stats.t.hits++;
            }

            // F4 Hit: Top 4 horses in Top 6 picks
            // Logic: Do the first 6 picks contain at least 4 horses from the actual Top 4? (Boxed First 4)
            const f4Matches = picks.slice(0, 6).filter(p => top4.includes(p));
            if (f4Matches.length >= 4) {
                stats.f4.hits++;
            }
        }

        // Calculate Rates
        if (stats.totalRaces > 0) {
            stats.win.rate = parseFloat(((stats.win.hits / stats.totalRaces) * 100).toFixed(1));
            stats.q.rate = parseFloat(((stats.q.hits / stats.totalRaces) * 100).toFixed(1));
            stats.t.rate = parseFloat(((stats.t.hits / stats.totalRaces) * 100).toFixed(1));
            stats.f4.rate = parseFloat(((stats.f4.hits / stats.totalRaces) * 100).toFixed(1));
        }

        return stats;
    }

    // 4. Daily Hit Rate Statistics (For Charts & Tables)
    async getDailyStats(startDate: string, endDate: string, type: 'pundit' | 'trend' | 'composite', trendKey?: string) {
        const whereClause: any = {
            date: { gte: startDate, lte: endDate },
            j18Payouts: { some: {} }
        };

        const races = await prisma.race.findMany({
            where: whereClause,
            include: {
                j18Likes: true,
                j18Trends: true,
                j18Payouts: true
            },
            orderBy: { date: 'desc' }
        });

        // Map: Date -> StatMetrics
        const dailyMap = new Map<string, {
            date: string;
            count: number;
            win: { hit: number, revenue: number, cost: number };
            q: { hit: number, revenue: number, cost: number };
            t: { hit: number, revenue: number, cost: number };
            f4: { hit: number, revenue: number, cost: number };
        }>();

        // Standard Betting Assumptions
        // const COSTS = { WIN: 20, Q: 30, T: 240, F4: 3600 }; // Now in calculateRaceRewards

        for (const race of races) {
            if (!race.j18Payouts[0]) continue;
            
            // Initialize Date Entry
            const dateStr = race.date; // YYYY/MM/DD
            if (!dailyMap.has(dateStr)) {
                dailyMap.set(dateStr, {
                    date: dateStr,
                    count: 0,
                    win: { hit: 0, revenue: 0, cost: 0 },
                    q: { hit: 0, revenue: 0, cost: 0 },
                    t: { hit: 0, revenue: 0, cost: 0 },
                    f4: { hit: 0, revenue: 0, cost: 0 }
                });
            }
            const entry = dailyMap.get(dateStr)!;

            // Parse Results
            const payouts = race.j18Payouts[0].payouts as unknown as J18PayoutItem[];
            const { winner } = this.parseResults(payouts);
            if (!winner) continue;

            // Determine Picks
            let picks: number[] = [];
            if (type === 'pundit') {
                if (race.j18Likes[0]) {
                    picks = race.j18Likes[0].recommendations as unknown as number[];
                }
            } else if (type === 'trend' && trendKey) {
                if (race.j18Trends[0]) {
                    const trends = race.j18Trends[0].trends as unknown as Record<string, string[]>;
                    if (trends[trendKey]) {
                        picks = trends[trendKey].map(Number);
                    }
                }
            } else if (type === 'composite') {
                const horseScores = new Map<number, number>();
                const scoreMap = [6, 5, 4, 3, 2, 1]; // Points for Rank 1-6

                // Add Pundit Scores
                if (race.j18Likes[0]) {
                    const punditPicks = race.j18Likes[0].recommendations as unknown as number[];
                    if (punditPicks) {
                        punditPicks.slice(0, 6).forEach((horse, idx) => {
                            const current = horseScores.get(horse) || 0;
                            horseScores.set(horse, current + scoreMap[idx]);
                        });
                    }
                }

                // Add Trend Scores
                if (race.j18Trends[0]) {
                    const trendsData = race.j18Trends[0].trends as unknown as Record<string, string[]>;
                    ['30', '15', '10', '5'].forEach(key => {
                        if (trendsData[key]) {
                            const trendPicks = trendsData[key].map(Number);
                            trendPicks.slice(0, 6).forEach((horse, idx) => {
                                const current = horseScores.get(horse) || 0;
                                horseScores.set(horse, current + scoreMap[idx]);
                            });
                        }
                    });
                }

                // Sort by Score Descending
                picks = Array.from(horseScores.entries())
                    .sort((a, b) => b[1] - a[1]) // Sort by score desc
                    .map(entry => entry[0]);
            }

            if (picks.length === 0) continue;

            // Check Hits using Shared Logic
            const res = this.calculateRaceRewards(payouts, picks);
            
            // Accumulate
            entry.count++;
            
            entry.win.cost += res.win.cost;
            entry.q.cost += res.q.cost;
            entry.t.cost += res.t.cost;
            entry.f4.cost += res.f4.cost;

            if (res.win.hit) { entry.win.hit++; entry.win.revenue += res.win.rev; }
            if (res.q.hit) { entry.q.hit++; entry.q.revenue += res.q.rev; }
            if (res.t.hit) { entry.t.hit++; entry.t.revenue += res.t.rev; }
            if (res.f4.hit) { entry.f4.hit++; entry.f4.revenue += res.f4.rev; }
        }

        // Final Transform to Array
        return Array.from(dailyMap.values()).map(d => {
            const calc = (metrics: { hit: number, revenue: number, cost: number }) => {
                const net = metrics.revenue - metrics.cost;
                const roi = metrics.cost > 0 ? (net / metrics.cost * 100) : 0;
                const rate = d.count > 0 ? (metrics.hit / d.count * 100) : 0;
                return {
                    hits: metrics.hit,
                    rate: parseFloat(rate.toFixed(1)),
                    revenue: metrics.revenue,
                    cost: metrics.cost,
                    net: net,
                    roi: parseFloat(roi.toFixed(1))
                };
            };

            return {
                date: d.date,
                raceCount: d.count,
                win: calc(d.win),
                q: calc(d.q),
                t: calc(d.t),
                f4: calc(d.f4)
            };
        });
    }
}
