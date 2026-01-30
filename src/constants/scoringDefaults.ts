export interface ScoringFactorConfig {
    label: string;
    weight: number; // Percentage (0-100)
    enabled: boolean;
    rules: Record<string, number>; // Flexible rules (e.g., rank1: 8, range_0_5: 3)
}

export interface ScoringConfig {
    factors: Record<string, ScoringFactorConfig>;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
    factors: {
        // 1. 同程時間 (Time at Same Distance)
        time_same_dist: {
            label: "同程時間",
            weight: 13.6,
            enabled: true,
            rules: {
                rank1: 8,
                rank2: 7,
                rank3: 6,
                rank4: 5,
                rank5: 4,
                rank6: 3,
                rank7: 2,
                rank8: 1,
                others: 0
            }
        },
        // 2. 騎師勝出率 (Jockey Win %)
        jockey_win: {
            label: "騎師勝出率",
            weight: 5.0,
            enabled: true,
            rules: {
                // Rule: Points per 1% win rate? Or brackets?
                // Let's assume brackets for now, or a multiplier rule.
                // For simplicity in Phase 1, we store "multiplier" or "max_points"
                // But the user wants "Rank" based logic usually.
                // Let's use a simple multiplier: score = rate * multiplier
                multiplier: 0.5 
            }
        },
        // 3. 騎師入圍率 (Jockey Place %)
        jockey_place: {
            label: "騎師入圍率",
            weight: 5.0,
            enabled: true,
            rules: {
                multiplier: 0.3
            }
        },
        // 4. 練馬師勝出率 (Trainer Win %)
        trainer_win: {
            label: "練馬師勝出率",
            weight: 5.0,
            enabled: true,
            rules: {
                multiplier: 0.5
            }
        },
        // 5. 練馬師入圍率 (Trainer Place %)
        trainer_place: {
            label: "練馬師入圍率",
            weight: 5.0,
            enabled: true,
            rules: {
                multiplier: 0.3
            }
        },
        // 6. 騎練配合勝出 (Partnership Win)
        partnership_win: {
            label: "騎練配合勝出",
            weight: 4.0,
            enabled: true,
            rules: {
                multiplier: 0.5
            }
        },
        // 7. 騎練配合入圍 (Partnership Place)
        partnership_place: {
            label: "騎練配合入圍",
            weight: 4.0,
            enabled: true,
            rules: {
                multiplier: 0.3
            }
        },
        // 8. 前領優勢 (Leading Advantage)
        leading_ability: {
            label: "前領優勢",
            weight: 6.0,
            enabled: true,
            rules: {
                rank1: 8, // Leading horse
                rank2: 6,
                rank3: 4,
                others: 1
            }
        },
        // 9. 分段時間 (Sectional Time)
        sectional_time: {
            label: "分段時間",
            weight: 8.0,
            enabled: true,
            rules: {
                rank1: 10, // Best sectional
                rank2: 8,
                rank3: 6,
                rank4: 4,
                others: 2
            }
        },
        // 10. 評分+-值 (Rating Change)
        rating_trend: {
            label: "評分走勢",
            weight: 5.0,
            enabled: true,
            rules: {
                drop_2_plus: 8, // Dropped > 2 points (advantage)
                drop_1_2: 6,
                same: 4,
                rise_1_5: 2,
                rise_6_plus: 0
            }
        },
        // 11. 體重變化 (Weight Change)
        horse_weight: {
            label: "體重變化",
            weight: 4.0,
            enabled: true,
            rules: {
                ideal_range: 8, // Within +/- 10lbs of winning weight
                moderate: 5,
                bad: 1
            }
        },
        // 12. 年齡 (Age)
        age: {
            label: "年齡",
            weight: 4.0,
            enabled: true,
            rules: {
                age_3: 6,
                age_4: 8, // Prime
                age_5: 7,
                age_6: 5,
                age_7_plus: 2
            }
        },
        // 13. 休息日 (Rest Days)
        rest_days: {
            label: "休息日",
            weight: 4.0,
            enabled: true,
            rules: {
                days_14_to_60: 8, // Ideal
                days_less_14: 4,  // Too soon?
                days_over_60: 5   // Fresh but rusty
            }
        },
        // 14. 晨操 (Trackwork)
        trackwork: {
            label: "晨操",
            weight: 8.0,
            enabled: true,
            rules: {
                active: 8,
                moderate: 5,
                inactive: 1
            }
        },
        // 15. 狀態 (Condition - Manual)
        condition: {
            label: "狀態(手動)",
            weight: 10.0,
            enabled: true,
            rules: {
                fit: 10,
                ok: 6,
                bad: 1,
                default: 1 // As requested
            }
        },
        // 16. 負磅值 (Carried Weight)
        carried_weight: {
            label: "負磅值",
            weight: 14.4, // Remaining to make ~100? No, let's just set a value.
            enabled: true,
            rules: {
                light: 10, // < 118
                medium: 7, // 118-128
                heavy: 4   // > 128
            }
        }
    }
};
