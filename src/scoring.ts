export interface RaceStats {
    starts: number;
    first: number;
    second: number;
    thirdFourth: number;
    fifthEighth: number;
    others: number;
}

export interface HorseData {
    name: string;
    code: string;
    career: RaceStats;
    season: RaceStats;
    trackDist: RaceStats;
    jockey: RaceStats;
}

const POINTS = {
    FIRST: 8,
    SECOND: 6,
    THIRD_FOURTH: 3,
    FIFTH_EIGHTH: 1,
    OTHER: 0
};

const WEIGHTS = {
    CAREER: 0.15,
    SEASON: 0.35,
    TRACK: 0.20,
    JOCKEY: 0.30
};

export function calculateCategoryScore(stats: RaceStats): number {
    return (stats.first * POINTS.FIRST) +
           (stats.second * POINTS.SECOND) +
           (stats.thirdFourth * POINTS.THIRD_FOURTH) +
           (stats.fifthEighth * POINTS.FIFTH_EIGHTH);
}

export function calculateTotalScore(horse: HorseData): {
    total: number;
    breakdown: {
        career: { raw: number, weighted: number };
        season: { raw: number, weighted: number };
        track: { raw: number, weighted: number };
        jockey: { raw: number, weighted: number };
    }
} {
    const careerScore = calculateCategoryScore(horse.career);
    const seasonScore = calculateCategoryScore(horse.season);
    const trackScore = calculateCategoryScore(horse.trackDist);
    const jockeyScore = calculateCategoryScore(horse.jockey);

    const weightedCareer = careerScore * WEIGHTS.CAREER;
    const weightedSeason = seasonScore * WEIGHTS.SEASON;
    const weightedTrack = trackScore * WEIGHTS.TRACK;
    const weightedJockey = jockeyScore * WEIGHTS.JOCKEY;

    const total = weightedCareer + weightedSeason + weightedTrack + weightedJockey;

    return {
        total: parseFloat(total.toFixed(2)),
        breakdown: {
            career: { raw: careerScore, weighted: weightedCareer },
            season: { raw: seasonScore, weighted: weightedSeason },
            track: { raw: trackScore, weighted: weightedTrack },
            jockey: { raw: jockeyScore, weighted: weightedJockey }
        }
    };
}

// Example Data from Spreadsheet: 飛來閃耀 (K175)
// Career: 10(0-1-3) -> Assuming 3 includes 3rd/4th. Let's assume 3rd-4th.
// Season: 4(0-1-1)
// Track: 8(0-1-3)
// Jockey: 1(0-0-1) -> The spreadsheet score was 6, implying a 2nd place. 
// If we assume strict input, we can verify.

export const exampleHorse: HorseData = {
    name: "飛來閃耀",
    code: "K175",
    career: { starts: 10, first: 0, second: 1, thirdFourth: 3, fifthEighth: 0, others: 6 },
    season: { starts: 4, first: 0, second: 1, thirdFourth: 1, fifthEighth: 0, others: 2 },
    trackDist: { starts: 8, first: 0, second: 1, thirdFourth: 3, fifthEighth: 0, others: 4 },
    // Adjusting Jockey to match Score 6 (1 Second place)
    jockey: { starts: 1, first: 0, second: 1, thirdFourth: 0, fifthEighth: 0, others: 0 } 
};
