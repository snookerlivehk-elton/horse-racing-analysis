import prisma from '../lib/prisma';

export interface ScoringConfig {
    weights: {
        trackwork: number;
        barrierTrial: number;
        // Future: form, jockey, draw, etc.
    };
    daysLookback: number; // How far back to check trackwork (e.g. 14 days)
}

export interface HorseScore {
    horseId: string;
    horseName: string;
    totalScore: number;
    breakdown: {
        trackworkScore: number;
        trialScore: number;
        details: any;
    };
}

const DEFAULT_CONFIG: ScoringConfig = {
    weights: {
        trackwork: 0.6,
        barrierTrial: 0.4
    },
    daysLookback: 21
};

export class ScoringEngine {
    private config: ScoringConfig;

    constructor(config: Partial<ScoringConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    async analyzeRace(horseIds: string[]): Promise<HorseScore[]> {
        const scores: HorseScore[] = [];

        for (const id of horseIds) {
            const score = await this.analyzeHorse(id);
            scores.push(score);
        }

        return scores.sort((a, b) => b.totalScore - a.totalScore);
    }

    async analyzeHorse(horseId: string): Promise<HorseScore> {
        const horse = await prisma.horse.findUnique({
            where: { id: horseId },
            include: {
                trackworks: {
                    orderBy: { date: 'desc' },
                    take: 20
                },
                barrierTrials: {
                    orderBy: { date: 'desc' },
                    take: 5
                }
            }
        });

        if (!horse) {
            throw new Error(`Horse not found: ${horseId}`);
        }

        // 1. Calculate Trackwork Score (0-100)
        const trackworkResult = this.calculateTrackworkScore(horse.trackworks);
        
        // 2. Calculate Barrier Trial Score (0-100)
        const trialResult = this.calculateTrialScore(horse.barrierTrials);

        // 3. Weighted Total
        const totalScore = 
            (trackworkResult.score * this.config.weights.trackwork) +
            (trialResult.score * this.config.weights.barrierTrial);

        return {
            horseId: horse.id,
            horseName: horse.name,
            totalScore: Math.round(totalScore * 10) / 10, // Round to 1 decimal
            breakdown: {
                trackworkScore: trackworkResult.score,
                trialScore: trialResult.score,
                details: {
                    trackwork: trackworkResult.details,
                    trial: trialResult.details
                }
            }
        };
    }

    private calculateTrackworkScore(trackworks: any[]): { score: number, details: any } {
        if (!trackworks || trackworks.length === 0) return { score: 0, details: "No data" };

        let score = 0;
        let fastWorkCount = 0;
        let totalWorkCount = 0;
        const recentLogs: string[] = [];

        // Logic:
        // - Each "快操" (Fast Work) / "試閘" = 15 points (Max 60)
        // - Each "踱步" (Trotting) / "游泳" = 5 points (Max 40)
        // - Recent activity boost (last 7 days)
        
        // Filter for last N days based on today (or assumption of race date being 'today')
        // For simplicity, we just take the scraped records which are usually recent
        
        for (const work of trackworks) {
            totalWorkCount++;
            
            if (work.type === '快操' || work.type === '倒快') {
                score += 15;
                fastWorkCount++;
                recentLogs.push(`[${work.date}] ${work.type}`);
            } else if (work.type === '踱步' || work.type === '游泳' || work.type === '機操') {
                score += 5;
            }
        }

        // Cap score at 100
        score = Math.min(score, 100);

        return {
            score,
            details: {
                totalWorkouts: totalWorkCount,
                fastWorkouts: fastWorkCount,
                recentFastWork: recentLogs.slice(0, 3)
            }
        };
    }

    private calculateTrialScore(trials: any[]): { score: number, details: any } {
        if (!trials || trials.length === 0) return { score: 50, details: "No recent trials" }; // Base score for no trials

        let score = 0;
        const recentTrial = trials[0]; // Most recent

        // Logic based on Rank
        if (recentTrial.rank) {
            if (recentTrial.rank === 1) score = 100;
            else if (recentTrial.rank <= 3) score = 90;
            else if (recentTrial.rank <= 6) score = 75;
            else score = 60;
        } else {
            score = 60; // Default if no rank parsed
        }

        return {
            score,
            details: {
                lastTrialDate: recentTrial.date,
                rank: recentTrial.rank,
                totalHorses: recentTrial.totalHorses
            }
        };
    }
}
