import prisma from '../lib/prisma';

export interface ScoringConfig {
    weights: {
        form: number;
        trackwork: number;
        barrierTrial: number;
        jockey: number;
        partnership: number;
        draw: number;
        courseDistance: number;
        class: number;
        rating: number;
    };
    daysLookback: number;
}

export interface HorseScore {
    horseId: string;
    horseName: string;
    totalScore: number;
    breakdown: {
        formScore: number;
        trackworkScore: number;
        trialScore: number;
        jockeyScore: number;
        partnershipScore: number;
        drawScore: number;
        courseDistScore: number;
        classScore: number;
        ratingScore: number;
        details: any;
    };
}

const DEFAULT_CONFIG: ScoringConfig = {
    weights: {
        form: 0.20,
        jockey: 0.15,
        courseDistance: 0.15,
        trackwork: 0.10,
        draw: 0.10,
        class: 0.10,
        rating: 0.10,
        partnership: 0.05,
        barrierTrial: 0.05
    },
    daysLookback: 21
};

export interface RaceContext {
    course: string; // e.g., 'ST', 'HV'
    distance: number; // e.g., 1200, 1650
    trackType: string; // 'Turf', 'All Weather' (implied in course for now)
    courseType?: string; // 'A', 'B', 'C', 'C+3'
}

export interface RaceEntryContext {
    horseId: string;
    jockey: string;
    trainer: string;
    draw?: number;
    rating?: number;
    class?: string; // e.g., "4"
}

export class ScoringEngine {
    private config: ScoringConfig;

    constructor(config: Partial<ScoringConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    async analyzeRace(entries: RaceEntryContext[], raceContext?: RaceContext): Promise<HorseScore[]> {
        const scores: HorseScore[] = [];

        const promises = entries.map(entry => 
            this.analyzeHorse(entry, raceContext)
                .catch(e => {
                    console.error(`Error analyzing horse ${entry.horseId}:`, e);
                    return null;
                })
        );

        const results = await Promise.all(promises);
        
        return results
            .filter((s): s is HorseScore => s !== null)
            .sort((a, b) => b.totalScore - a.totalScore);
    }

    async analyzeHorse(entry: RaceEntryContext, raceContext?: RaceContext): Promise<HorseScore> {
        const { horseId, jockey, trainer, draw, rating, class: raceClass } = entry;
        
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
                },
                performances: {
                    orderBy: { createdAt: 'desc' },
                    take: 20 // Increase take to analyze CD history
                }
            }
        });

        if (!horse) {
            throw new Error(`Horse not found: ${horseId}`);
        }

        // 1. Form Score
        const formResult = this.calculateFormScore(horse.performances);

        // 2. Trackwork Score
        const trackworkResult = this.calculateTrackworkScore(horse.trackworks);
        
        // 3. Barrier Trial Score
        const trialResult = this.calculateTrialScore(horse.barrierTrials);

        // 4. Jockey Score
        const jockeyResult = await this.calculateJockeyScore(jockey, horse.performances);

        // 5. Partnership Score
        const partnershipResult = await this.calculatePartnershipScore(jockey, trainer);

        // 6. Draw Score
        const drawResult = this.calculateDrawScore(draw, raceContext);

        // 7. Course & Distance Score
        const cdResult = this.calculateCourseDistanceScore(horse.performances, raceContext);

        // 8. Class Score
        const classResult = this.calculateClassScore(horse.performances, raceClass);

        // 9. Rating Score
        const ratingResult = this.calculateRatingScore(horse.performances, rating);

        // Weighted Total
        const totalScore = 
            (formResult.score * this.config.weights.form) +
            (trackworkResult.score * this.config.weights.trackwork) +
            (trialResult.score * this.config.weights.barrierTrial) +
            (jockeyResult.score * this.config.weights.jockey) +
            (partnershipResult.score * this.config.weights.partnership) +
            (drawResult.score * this.config.weights.draw) +
            (cdResult.score * this.config.weights.courseDistance) +
            (classResult.score * this.config.weights.class) +
            (ratingResult.score * this.config.weights.rating);

        return {
            horseId: horse.id,
            horseName: horse.name,
            totalScore: Math.round(totalScore * 10) / 10,
            breakdown: {
                formScore: formResult.score,
                trackworkScore: trackworkResult.score,
                trialScore: trialResult.score,
                jockeyScore: jockeyResult.score,
                partnershipScore: partnershipResult.score,
                drawScore: drawResult.score,
                courseDistScore: cdResult.score,
                classScore: classResult.score,
                ratingScore: ratingResult.score,
                details: {
                    form: formResult.details,
                    trackwork: trackworkResult.details,
                    trial: trialResult.details,
                    jockey: jockeyResult.details,
                    partnership: partnershipResult.details,
                    draw: drawResult.details,
                    courseDist: cdResult.details,
                    class: classResult.details,
                    rating: ratingResult.details
                }
            }
        };
    }

    private calculateDrawScore(draw?: number, context?: RaceContext): { score: number, details: any } {
        if (!draw || !context) return { score: 50, details: "No draw/context" }; // Neutral

        let score = 50;
        let comment = "Neutral";

        // Simple Heuristics (Can be refined with stats)
        // HV 1200m: Inner draws (1-4) are gold
        if (context.course === 'HV' && context.distance === 1200) {
            if (draw <= 4) { score = 100; comment = "Excellent Draw (HV 1200)"; }
            else if (draw <= 8) { score = 60; comment = "Average Draw"; }
            else { score = 20; comment = "Poor Draw (HV 1200)"; }
        }
        // ST 1000m Straight: Outer draws often better (10-14)
        else if (context.course === 'ST' && context.distance === 1000) {
            if (draw >= 10) { score = 90; comment = "Good Draw (ST 1000)"; }
            else if (draw >= 5) { score = 60; comment = "Average"; }
            else { score = 30; comment = "Poor Draw (Inside)"; }
        }
        // General Rule: Inner is slightly better
        else {
            if (draw <= 4) { score = 80; comment = "Good Draw"; }
            else if (draw <= 9) { score = 60; comment = "Average Draw"; }
            else { score = 40; comment = "Wide Draw"; }
        }

        return { score, details: { draw, comment } };
    }

    private calculateCourseDistanceScore(history: any[], context?: RaceContext): { score: number, details: any } {
        if (!context) return { score: 0, details: "No context" };
        if (!history || history.length === 0) return { score: 0, details: "No history" };

        let points = 0;
        let matchingRuns = 0;

        history.forEach(run => {
            // Check if course and distance match roughly
            // run.course might be "ST / A", run.distance "1200"
            const runCourse = run.venue || run.course || ''; // venue usually 'ST' or 'HV'
            const runDist = parseInt(run.distance);

            // Fuzzy match
            const courseMatch = runCourse.includes(context.course);
            const distMatch = runDist === context.distance;

            if (courseMatch && distMatch) {
                matchingRuns++;
                const rank = parseInt(run.place);
                if (!isNaN(rank)) {
                    if (rank === 1) points += 100;
                    else if (rank === 2) points += 80;
                    else if (rank === 3) points += 60;
                    else if (rank <= 5) points += 30;
                }
            }
        });

        const score = matchingRuns > 0 ? Math.min(100, (points / matchingRuns) + (matchingRuns * 5)) : 0; // Bonus for experience

        return { score: Math.round(score), details: { matchingRuns, avgPoints: points / (matchingRuns || 1) } };
    }

    private calculateClassScore(history: any[], currentClass?: string): { score: number, details: any } {
        if (!currentClass || !history || history.length === 0) return { score: 50, details: "Neutral" };

        // Check if dropped in class
        // Current Class: 4 -> Last Run Class: 3 => Dropped => Good
        const lastRun = history[0]; // Most recent
        const lastClass = lastRun.class; // e.g., "3"

        let score = 50;
        let comment = "Same Class";

        const currentC = parseInt(currentClass);
        const lastC = parseInt(lastClass);

        if (!isNaN(currentC) && !isNaN(lastC)) {
            if (currentC > lastC) { 
                // Numeric class higher means lower grade (Class 1 is best, Class 5 is worst)
                // Wait, typically Class 1 > Class 2. 
                // So if Last was 3, Current is 4. 4 > 3. 
                // Dropping in class means moving to a "larger number" class (easier).
                score = 90; 
                comment = "Class Dropper (Advantage)"; 
            } else if (currentC < lastC) {
                // Moving up (e.g. 4 -> 3)
                score = 30;
                comment = "Class Riser (Tougher)";
            }
        }

        return { score, details: { currentClass, lastClass, comment } };
    }

    private calculateRatingScore(history: any[], currentRating?: number): { score: number, details: any } {
        if (!currentRating || !history) return { score: 50, details: "No rating" };

        // Find last winning rating
        const winningRun = history.find(h => parseInt(h.place) === 1);
        
        let score = 50;
        let comment = "No wins found";

        if (winningRun) {
            const winRating = parseInt(winningRun.rating);
            if (!isNaN(winRating)) {
                if (currentRating < winRating) {
                    score = 90;
                    comment = `Below winning rating (${winRating})`;
                } else if (currentRating <= winRating + 5) {
                    score = 60;
                    comment = `Near winning rating (${winRating})`;
                } else {
                    score = 30;
                    comment = `Above winning rating (${winRating})`;
                }
            }
        }

        return { score, details: { currentRating, lastWinRating: winningRun?.rating, comment } };
    }


    private async calculateJockeyScore(jockey: string | undefined, horseHistory: any[]): Promise<{ score: number, details: any }> {
        if (!jockey) return { score: 0, details: "No jockey declared" };

        // A. Recent Form (Last 20 rides)
        // We need to query RaceResults for this jockey.
        // Note: This query might be slow without indices on 'jockey'.
        const recentRides = await prisma.raceResult.findMany({
            where: { jockey: { contains: jockey } }, // Use contains for safety, or equals if exact
            orderBy: { createdAt: 'desc' }, // Approximation of date
            take: 20,
            select: { place: true }
        });

        let recentPoints = 0;
        let validRides = 0;
        recentRides.forEach(ride => {
            if (ride.place) {
                validRides++;
                if (ride.place === 1) recentPoints += 100;
                else if (ride.place === 2) recentPoints += 60;
                else if (ride.place === 3) recentPoints += 40;
                else if (ride.place <= 5) recentPoints += 10;
            }
        });
        const recentScore = validRides > 0 ? (recentPoints / validRides) : 0;

        // B. History with THIS Horse
        const historyWithHorse = horseHistory.filter(h => h.jockey && h.jockey.includes(jockey));
        let historyPoints = 0;
        let validHistory = 0;
        historyWithHorse.forEach(h => {
            const rank = parseInt(h.place);
            if (!isNaN(rank)) {
                validHistory++;
                if (rank === 1) historyPoints += 100;
                else if (rank === 2) historyPoints += 70;
                else if (rank === 3) historyPoints += 50;
                else if (rank <= 5) historyPoints += 20;
            }
        });
        const historyScore = validHistory > 0 ? (historyPoints / validHistory) : 0;

        // Weighting: 60% Recent Form, 40% History with Horse (if exists)
        let finalScore = 0;
        if (validHistory > 0) {
            finalScore = (recentScore * 0.6) + (historyScore * 0.4);
        } else {
            finalScore = recentScore;
        }

        return {
            score: Math.round(finalScore),
            details: {
                jockey,
                recentRides: validRides,
                recentScore: Math.round(recentScore),
                historyRides: validHistory,
                historyScore: Math.round(historyScore)
            }
        };
    }

    private async calculatePartnershipScore(jockey: string | undefined, trainer: string | undefined): Promise<{ score: number, details: any }> {
        if (!jockey || !trainer) return { score: 0, details: "Missing jockey/trainer" };

        // Query Partnership stats (Last 30 collaborations)
        const partnershipRides = await prisma.raceResult.findMany({
            where: { 
                jockey: { contains: jockey },
                trainer: { contains: trainer }
            },
            orderBy: { createdAt: 'desc' },
            take: 30,
            select: { place: true }
        });

        let points = 0;
        let count = 0;
        
        partnershipRides.forEach(ride => {
            if (ride.place) {
                count++;
                if (ride.place === 1) points += 100;
                else if (ride.place === 2) points += 75;
                else if (ride.place === 3) points += 50;
                else if (ride.place === 4) points += 25;
            }
        });

        const score = count > 0 ? (points / count) : 0;

        return {
            score: Math.round(score),
            details: {
                jockey,
                trainer,
                collaborations: count,
                avgScore: Math.round(score)
            }
        };
    }

    private calculateFormScore(performances: any[]): { score: number, details: any } {
        if (!performances || performances.length === 0) return { score: 0, details: "No data" };

        // Filter valid ranks (numeric)
        const validRaces = performances.filter(p => {
            const rank = parseInt(p.place);
            return !isNaN(rank);
        }).slice(0, 5); // Analyze last 5 starts

        if (validRaces.length === 0) return { score: 0, details: "No valid runs" };

        let totalPoints = 0;
        const history = [];

        for (const race of validRaces) {
            const rank = parseInt(race.place);
            let points = 0;
            
            // Basic point system
            if (rank === 1) points = 100;
            else if (rank === 2) points = 80;
            else if (rank === 3) points = 60;
            else if (rank === 4) points = 40;
            else if (rank <= 6) points = 20;
            else points = 10; // Participation points

            // Decay factor? (Most recent is more important)
            // For now, simple average.
            
            totalPoints += points;
            history.push({ 
                date: race.date, 
                rank: rank, 
                points,
                summary: `${race.date}: ${rank} (${points})`
            });
        }

        const avgScore = totalPoints / validRaces.length;

        return {
            score: Math.round(avgScore),
            details: {
                runsAnalyzed: validRaces.length,
                history: history
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
