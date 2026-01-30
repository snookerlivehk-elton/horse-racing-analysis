import prisma from '../lib/prisma';
import { ScoringConfig, ScoringFactorConfig } from '../constants/scoringDefaults';

interface ScoreBreakdown {
    rawScore: number; // The rule-based score (e.g., 8)
    weightedScore: number; // The final weighted score (e.g., 8 * 13.6% = 1.088)
    factorLabel: string;
    sourceValue?: string | number; // The raw data (e.g., "14 days", "Rank 1", "Win 15%")
}

export interface HorseScore {
    horseNo: number;
    horseName: string;
    totalScore: number;
    breakdown: Record<string, ScoreBreakdown>; // key: factor_key
}

interface ComputedStats {
    bestTimeSameDist: number | null;
    avgEarlyPos: number | null;
    lastSectional: number | null;
    daysSinceLastRun: number | null;
    weightDiff: number | null;
    jockeyWinRate: number | null;
    jockeyPlaceRate: number | null;
    trainerWinRate: number | null;
    trainerPlaceRate: number | null;
}

export class ScoringEngine {
    private config: ScoringConfig;

    constructor(config: ScoringConfig) {
        this.config = config;
    }

    private parseTime(timeStr: string | null | undefined): number | null {
        if (!timeStr) return null;
        try {
            const parts = timeStr.trim().split(':');
            if (parts.length === 2) {
                return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
            } else if (parts.length === 1) {
                return parseFloat(parts[0]);
            }
        } catch (e) {
            return null;
        }
        return null;
    }

    private parseDate(dateStr: string | null | undefined): Date | null {
        if (!dateStr) return null;
        try {
            // Handle YYYY-MM-DD
            if (dateStr.includes('-')) {
                return new Date(dateStr);
            }
            // Handle dd/mm/yy
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                let year = parseInt(parts[2]);
                if (year < 100) year += 2000;
                return new Date(year, parseInt(parts[1]) - 1, parseInt(parts[0]));
            }
        } catch (e) {
            return null;
        }
        return null;
    }

    private parseRunningPosition(posStr: string | null | undefined): number[] {
        if (!posStr) return [];
        // "2 3 2 1" -> [2, 3, 2, 1]
        // Sometimes "11 10 9"
        return posStr.trim().split(/\s+/).map(p => parseInt(p)).filter(n => !isNaN(n));
    }

    async calculateRaceScore(raceId: string): Promise<HorseScore[]> {
        // 1. Fetch Race Data with Results (Horses)
        const race = await prisma.race.findUnique({
            where: { hkjcId: raceId },
            include: {
                results: true
            }
        });

        if (!race) {
            throw new Error(`Race ${raceId} not found`);
        }

        const raceDate = this.parseDate(race.date);

        // 2a. Fetch Manual Adjustments
        const adjustments = await prisma.raceScoringAdjustment.findMany({
            where: { raceId: raceId }
        });
        const adjMap = new Map<number, any>();
        adjustments.forEach(a => adjMap.set(a.horseNo, a));

        // 2b. Fetch Horse Profiles & Trackwork for all participants
        const promises = race.results.map(async (result) => {
            if (!result.horseName) return null;

            const horse = await prisma.horse.findFirst({
                where: { name: result.horseName },
                include: {
                    performances: {
                        orderBy: { date: 'desc' } // dd/mm/yy sorting might be imperfect as string, but usually okay for recent
                    },
                    trackworks: {
                        take: 20, // Limit trackwork fetch
                        orderBy: { date: 'desc' }
                    }
                }
            });
            
            // Also fetch Jockey/Trainer stats if available (Phase 2)
            // For now, we'll try to fetch PersonStats
            const jockeyStats = result.jockey ? await prisma.personStats.findFirst({
                where: { name: result.jockey, type: 'Jockey', season: 'Current' }
            }) : null;

            const trainerStats = result.trainer ? await prisma.personStats.findFirst({
                where: { name: result.trainer, type: 'Trainer', season: 'Current' }
            }) : null;

            return { result, horse, jockeyStats, trainerStats };
        });

        const results = await Promise.all(promises);
        const participants = results.filter((p): p is NonNullable<typeof p> => p !== null);

        // 3. Compute Metrics for Ranking
        const participantStats = new Map<number, ComputedStats>(); // horseNo -> stats

        for (const p of participants) {
            const { result, horse, jockeyStats, trainerStats } = p;
            
            // a. Time Same Distance
            let bestTime: number | null = null;
            if (horse && race.distance && race.venue) {
                const raceDist = race.distance;
                const raceVenue = race.venue;
                // Filter performances with loose match on venue (ST/HV) and exact distance
                const matches = horse.performances.filter((perf: any) => {
                    // venue might be "ST / Turf / C+3", race.venue is "ST"
                    const sameVenue = perf.venue?.includes(raceVenue) || false;
                    // distance might be "1200", race.distance is 1200
                    const sameDist = perf.distance == raceDist.toString();
                    return sameVenue && sameDist;
                });
                
                // Find best time
                for (const m of matches) {
                    const t = this.parseTime(m.finishTime);
                    if (t && (bestTime === null || t < bestTime)) {
                        bestTime = t;
                    }
                }
            }

            // b. Leading Ability (Avg Early Position)
            let avgEarlyPos: number | null = null;
            if (horse) {
                // Take last 5 races
                const recent = horse.performances.slice(0, 5);
                let totalPos = 0;
                let count = 0;
                for (const r of recent) {
                    const positions = this.parseRunningPosition(r.runningPosition);
                    if (positions.length > 0) {
                        totalPos += positions[0]; // First section position
                        count++;
                    }
                }
                if (count > 0) avgEarlyPos = totalPos / count;
            }

            // c. Sectional Time
            let lastSectional: number | null = null;
            if (horse) {
                // Find recent performance with valid sectional times
                const recent = horse.performances.slice(0, 5);
                for (const r of recent) {
                    if (r.sectionalTimes && Array.isArray(r.sectionalTimes) && r.sectionalTimes.length > 0) {
                        const times = r.sectionalTimes as string[];
                        // Assume the last element is the final sectional time
                        // We need to parse "23.10" or "22.45"
                        const last = times[times.length - 1];
                        const t = this.parseTime(last);
                        if (t) {
                            lastSectional = t;
                            break; // Use the most recent valid one
                        }
                    }
                }
            }

            // d. Rest Days
            let daysSinceLastRun: number | null = null;
            if (horse && horse.performances.length > 0 && raceDate) {
                // performance[0] might be *this* race if scraped after.
                // But usually we are analyzing *before* race.
                // Check if performance date == race date.
                let lastRun = horse.performances[0];
                let lastRunDate = this.parseDate(lastRun.date);
                
                if (lastRunDate && lastRunDate.getTime() === raceDate.getTime()) {
                    // This is the current race, look at next one
                    if (horse.performances.length > 1) {
                        lastRun = horse.performances[1];
                        lastRunDate = this.parseDate(lastRun.date);
                    } else {
                        lastRunDate = null;
                    }
                }

                if (lastRunDate) {
                    const diffTime = Math.abs(raceDate.getTime() - lastRunDate.getTime());
                    daysSinceLastRun = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                }
            }

            // e. Weight Diff
            let weightDiff: number | null = null;
            // Need body weight. result.weight is carried weight.
            // Assuming result.weight for now if that's what user meant by "Horse Weight" (Body Weight).
            // Actually "horse_weight" usually means body weight. "carried_weight" is separate factor.
            // If we don't have body weight, skip.
            
            // Stats
            const jWin = jockeyStats?.stats ? (jockeyStats.stats as any).winRate : null;
            const jPlace = jockeyStats?.stats ? (jockeyStats.stats as any).placeRate : null;
            const tWin = trainerStats?.stats ? (trainerStats.stats as any).winRate : null;
            const tPlace = trainerStats?.stats ? (trainerStats.stats as any).placeRate : null;

            participantStats.set(result.horseNo, {
                bestTimeSameDist: bestTime,
                avgEarlyPos: avgEarlyPos,
                lastSectional: lastSectional,
                daysSinceLastRun: daysSinceLastRun,
                weightDiff: weightDiff,
                jockeyWinRate: typeof jWin === 'number' ? jWin : null,
                jockeyPlaceRate: typeof jPlace === 'number' ? jPlace : null,
                trainerWinRate: typeof tWin === 'number' ? tWin : null,
                trainerPlaceRate: typeof tPlace === 'number' ? tPlace : null
            });
        }

        // Helper to get rank (1-based)
        const getRank = (horseNo: number, metricSelector: (s: ComputedStats) => number | null, ascending: boolean = true): number => {
            const val = metricSelector(participantStats.get(horseNo)!);
            if (val === null) return 999; // Not ranked
            
            // Get all valid values
            const allVals = Array.from(participantStats.values())
                .map(metricSelector)
                .filter(v => v !== null) as number[];
            
            // Sort
            allVals.sort((a, b) => ascending ? a - b : b - a);
            
            // Find index
            return allVals.indexOf(val) + 1;
        };

        // 4. Calculate Scores
        const horseScores: HorseScore[] = [];

        for (const p of participants) {
            const { result, horse } = p;
            const breakdown: Record<string, ScoreBreakdown> = {};
            let totalWeightedScore = 0;
            const stats = participantStats.get(result.horseNo)!;
            const adj = adjMap.get(result.horseNo); // Get adjustment if exists

            for (const [key, factor] of Object.entries(this.config.factors)) {
                if (!factor.enabled) continue;

                let rawScore = 0;
                let sourceValue: string | number | undefined;

                // Handle Comparative Factors
                if (key === 'time_same_dist') {
                    // Rank by time (ascending)
                    const rank = getRank(result.horseNo, s => s.bestTimeSameDist, true);
                    rawScore = this.getRankScore(rank, factor.rules);
                    sourceValue = stats.bestTimeSameDist ? `${(stats.bestTimeSameDist / 60).toFixed(2).replace('.', ':')} (Rank ${rank})` : 'N/A';
                } 
                else if (key === 'leading_ability') {
                    // Rank by avg early pos (ascending - lower is better)
                    const rank = getRank(result.horseNo, s => s.avgEarlyPos, true);
                    rawScore = this.getRankScore(rank, factor.rules);
                    sourceValue = stats.avgEarlyPos ? `${stats.avgEarlyPos.toFixed(1)} (Rank ${rank})` : 'N/A';
                }
                else if (key === 'sectional_time') {
                    // Rank by sectional (ascending)
                    const rank = getRank(result.horseNo, s => s.lastSectional, true);
                    rawScore = this.getRankScore(rank, factor.rules);
                    sourceValue = stats.lastSectional ? `${(stats.lastSectional).toFixed(2)}s (Rank ${rank})` : 'N/A';
                }
                // Handle Stats Factors (Absolute)
                else if (key === 'jockey_win') {
                    rawScore = (stats.jockeyWinRate || 0) * (factor.rules.multiplier || 0.5);
                    sourceValue = stats.jockeyWinRate ? `${(stats.jockeyWinRate * 100).toFixed(1)}%` : '0%';
                }
                else if (key === 'jockey_place') {
                    rawScore = (stats.jockeyPlaceRate || 0) * (factor.rules.multiplier || 0.3);
                    sourceValue = stats.jockeyPlaceRate ? `${(stats.jockeyPlaceRate * 100).toFixed(1)}%` : '0%';
                }
                else if (key === 'trainer_win') {
                    rawScore = (stats.trainerWinRate || 0) * (factor.rules.multiplier || 0.5);
                    sourceValue = stats.trainerWinRate ? `${(stats.trainerWinRate * 100).toFixed(1)}%` : '0%';
                }
                else if (key === 'trainer_place') {
                    rawScore = (stats.trainerPlaceRate || 0) * (factor.rules.multiplier || 0.3);
                    sourceValue = stats.trainerPlaceRate ? `${(stats.trainerPlaceRate * 100).toFixed(1)}%` : '0%';
                }
                else if (key === 'partnership_win' || key === 'partnership_place') {
                    rawScore = 0; // Abandoned
                    sourceValue = 'N/A';
                }
                else if (key === 'rest_days') {
                     if (stats.daysSinceLastRun !== null) {
                        const d = stats.daysSinceLastRun;
                        if (d >= 14 && d <= 60) rawScore = factor.rules.days_14_to_60 || 8;
                        else if (d >= 61 && d <= 90) rawScore = factor.rules.days_61_to_90 || 6;
                        else if (d >= 91 && d <= 120) rawScore = factor.rules.days_91_to_120 || 4;
                        else if (d >= 121 && d <= 180) rawScore = factor.rules.days_121_to_180 || 2;
                        else rawScore = factor.rules.days_over_180 || 0;
                        sourceValue = `${d} days`;
                     } else {
                         rawScore = factor.rules.days_14_to_60 || 8; // Default?
                         sourceValue = 'Unknown (Default)';
                     }
                }
                else {
                    // Use existing logic for other factors
                    const calc = await this.calculateFactor(key, factor, result, horse, race, adj);
                    rawScore = calc.score;
                    sourceValue = calc.source;
                }

                const weightedScore = rawScore * (factor.weight / 100);

                breakdown[key] = {
                    rawScore,
                    weightedScore,
                    factorLabel: factor.label,
                    sourceValue
                };
                totalWeightedScore += weightedScore;
            }
            
            // Add Manual Points if any
            if (adj && adj.manualPoints) {
                totalWeightedScore += adj.manualPoints;
                breakdown['manual_adjustment'] = {
                    rawScore: adj.manualPoints,
                    weightedScore: adj.manualPoints,
                    factorLabel: '手動修正'
                };
            }

            horseScores.push({
                horseNo: result.horseNo,
                horseName: result.horseName || 'Unknown',
                totalScore: totalWeightedScore,
                breakdown
            });
        }

        return horseScores.sort((a, b) => b.totalScore - a.totalScore);
    }

    private getRankScore(rank: number, rules: any): number {
        if (rank > 900) return rules.others || 0; // Not ranked
        if (rank === 1) return rules.rank1 || 8;
        if (rank === 2) return rules.rank2 || 7;
        if (rank === 3) return rules.rank3 || 6;
        if (rank === 4) return rules.rank4 || 5;
        if (rank === 5) return rules.rank5 || 4;
        if (rank === 6) return rules.rank6 || 3;
        if (rank === 7) return rules.rank7 || 2;
        if (rank === 8) return rules.rank8 || 1;
        return rules.others || 0;
    }

    // --- Factor Calculators (Legacy/Absolute) ---

        private async calculateFactor(
        key: string, 
        factor: ScoringFactorConfig, 
        result: any, 
        horse: any,
        race: any,
        adj: any = null
    ): Promise<{ score: number, source: string }> {
        const rules = factor.rules;

        switch (key) {
            case 'rating_trend':
                if (!result.ratingChange) return { score: rules.same || 4, source: 'No Change' };
                let rChange = 0;
                try {
                    rChange = parseInt(result.ratingChange.replace('+', ''));
                } catch (e) {
                    return { score: rules.same || 4, source: 'Error' };
                }
                const trendStr = rChange > 0 ? `+${rChange}` : `${rChange}`;
                if (rChange <= -2) return { score: rules.drop_2_plus || 8, source: trendStr };
                if (rChange < 0) return { score: rules.drop_1_2 || 6, source: trendStr };
                if (rChange === 0) return { score: rules.same || 4, source: trendStr };
                if (rChange <= 5) return { score: rules.rise_1_5 || 2, source: trendStr };
                return { score: rules.rise_6_plus || 0, source: trendStr };

            case 'horse_weight':
                // Placeholder for now as we lack body weight data
                return { score: rules.moderate || 5, source: 'N/A' };

            case 'age':
                if (!horse || !horse.age) return { score: rules.age_5 || 7, source: 'Unknown' };
                const age = parseInt(horse.age);
                if (isNaN(age)) return { score: rules.age_5 || 7, source: 'Invalid' };
                if (age <= 3) return { score: rules.age_3 || 6, source: `${age}yo` };
                if (age === 4) return { score: rules.age_4 || 8, source: `${age}yo` };
                if (age === 5) return { score: rules.age_5 || 7, source: `${age}yo` };
                if (age === 6) return { score: rules.age_6 || 5, source: `${age}yo` };
                return { score: rules.age_7_plus || 2, source: `${age}yo` };

            case 'trackwork':
                if (!horse || !horse.trackworks) return { score: rules.inactive || 1, source: '0' };
                const count = horse.trackworks.length; 
                if (count > 5) return { score: rules.active || 8, source: `${count} records` };
                if (count > 0) return { score: rules.moderate || 5, source: `${count} records` };
                return { score: rules.inactive || 1, source: '0 records' };

            case 'condition':
                // Check if manual adjustment exists
                if (adj && typeof adj.conditionScore === 'number') {
                    return { score: adj.conditionScore, source: 'Manual' };
                }
                return { score: rules.default || 1, source: 'Default' };

            case 'carried_weight':
                if (!result.weight) return { score: rules.medium || 7, source: 'Unknown' };
                const w = parseInt(result.weight);
                if (isNaN(w)) return { score: rules.medium || 7, source: 'Invalid' };
                if (w < 118) return { score: rules.light || 10, source: `${w}lbs` };
                if (w <= 128) return { score: rules.medium || 7, source: `${w}lbs` };
                return { score: rules.heavy || 4, source: `${w}lbs` };

            default:
                return { score: 0, source: 'N/A' };
        }
    }
}

