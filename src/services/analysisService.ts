
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
                winRevenue: 0, qRevenue: 0, tRevenue: 0, f4Revenue: 0,
                winCost: 0, qCost: 0, tCost: 0, f4Cost: 0
            },
            trendStats: {} as Record<string, { 
                winHit: number, qHit: number, tHit: number, f4Hit: number, count: number,
                winRevenue: number, qRevenue: number, tRevenue: number, f4Revenue: number,
                winCost: number, qCost: number, tCost: number, f4Cost: number
            }>
        };

        // Standard Betting Assumptions (Cost per Race)
        const COSTS = {
            WIN: 20,    // Top 2 ($10/bet * 2)
            Q: 30,      // Top 3 Box ($10/bet * 3)
            T: 240,     // Top 4 Box ($10/bet * 24)
            F4: 3600    // Top 6 Box ($10/bet * 360)
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
                    
                    // Add Costs
                    stats.punditStats.winCost += COSTS.WIN;
                    stats.punditStats.qCost += COSTS.Q;
                    stats.punditStats.tCost += COSTS.T;
                    stats.punditStats.f4Cost += COSTS.F4;

                    if (res.winHit) { stats.punditStats.winHit++; stats.punditStats.winRevenue += winDiv; }
                    if (res.qHit) { stats.punditStats.qHit++; stats.punditStats.qRevenue += qDiv; }
                    if (res.tHit) { stats.punditStats.tHit++; stats.punditStats.tRevenue += tDiv; }
                    if (res.f4Hit) { stats.punditStats.f4Hit++; stats.punditStats.f4Revenue += f4Div; }
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
                                winRevenue: 0, qRevenue: 0, tRevenue: 0, f4Revenue: 0,
                                winCost: 0, qCost: 0, tCost: 0, f4Cost: 0
                            };
                        }
                        
                        const res = checkHits(picks);
                        stats.trendStats[timeKey].count++;
                        
                        // Add Costs
                        stats.trendStats[timeKey].winCost += COSTS.WIN;
                        stats.trendStats[timeKey].qCost += COSTS.Q;
                        stats.trendStats[timeKey].tCost += COSTS.T;
                        stats.trendStats[timeKey].f4Cost += COSTS.F4;

                        if (res.winHit) { stats.trendStats[timeKey].winHit++; stats.trendStats[timeKey].winRevenue += winDiv; }
                        if (res.qHit) { stats.trendStats[timeKey].qHit++; stats.trendStats[timeKey].qRevenue += qDiv; }
                        if (res.tHit) { stats.trendStats[timeKey].tHit++; stats.trendStats[timeKey].tRevenue += tDiv; }
                        if (res.f4Hit) { stats.trendStats[timeKey].f4Hit++; stats.trendStats[timeKey].f4Revenue += f4Div; }
                    }
                });
            }
        }

        return stats;
    }

    // 4. Daily Hit Rate Statistics (For Charts & Tables)
    async getDailyStats(startDate: string, endDate: string, type: 'pundit' | 'trend', trendKey?: string) {
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
        const COSTS = {
            WIN: 20, Q: 30, T: 240, F4: 3600
        };

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
            const { winner, placings } = this.parseResults(payouts);
            if (!winner) continue;

            // Get Dividends
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

            // Parse Rank Details (Second, Third, Fourth)
            let second: number | null = null;
            let third: number | null = null;

            const tPool = payouts.find(p => p.name.includes('三重彩'));
            if (tPool && tPool.list.length > 0) {
                 const parts = tPool.list[0].shengchuzuhe.split(/[-+,]/).map(Number);
                 if (parts.length >= 3) { second = parts[1]; third = parts[2]; }
            }
            // Fallback
            if (!second && placings.length > 0) {
                const others = placings.filter(h => h !== winner);
                if (others.length > 0) second = others[0];
                if (others.length > 1) third = others[1];
            }

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
            }

            if (picks.length === 0) continue;

            // Check Hits
            const checkHits = (p: number[]) => {
                const winHit = p.slice(0, 2).includes(winner);
                const qHit = (second && p.slice(0, 3).includes(winner) && p.slice(0, 3).includes(second)) || false;
                const tHit = (second && third && 
                              p.slice(0, 4).includes(winner) && 
                              p.slice(0, 4).includes(second) && 
                              p.slice(0, 4).includes(third)) || false;
                
                // F4 (Top 6 Box)
                let f4Hit = false;
                const f4Pool = payouts.find(pool => pool.name.includes('四重彩') || pool.name.includes('四連環'));
                if (f4Pool && f4Pool.list.length > 0) {
                     const parts = f4Pool.list[0].shengchuzuhe.split(/[-+,]/).map(Number);
                     if (parts.length >= 4) {
                         const top6 = new Set(p.slice(0, 6));
                         f4Hit = parts.slice(0, 4).every(h => top6.has(h));
                     }
                }

                return { winHit, qHit, tHit, f4Hit };
            };

            const res = checkHits(picks);
            
            // Accumulate
            entry.count++;
            
            entry.win.cost += COSTS.WIN;
            entry.q.cost += COSTS.Q;
            entry.t.cost += COSTS.T;
            entry.f4.cost += COSTS.F4;

            if (res.winHit) { entry.win.hit++; entry.win.revenue += winDiv; }
            if (res.qHit) { entry.q.hit++; entry.q.revenue += qDiv; }
            if (res.tHit) { entry.t.hit++; entry.t.revenue += tDiv; }
            if (res.f4Hit) { entry.f4.hit++; entry.f4.revenue += f4Div; }
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
