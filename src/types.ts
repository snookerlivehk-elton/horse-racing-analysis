export type TimePoint = "30'" | "15'" | "10'" | "5'" | "0'";

// 代表一場賽事在某個時間點的「綜合走勢」排名
// 陣列索引 0 代表排名第 1 的馬號，索引 1 代表排名第 2，以此類推
export interface TrendSnapshot {
    timePoint: TimePoint;
    rankings: number[]; // [Rank1_Horse, Rank2_Horse, Rank3_Horse, ...]
}

// 代表一場賽事的最終結果
export interface RaceResult {
    raceNumber: number;
    positions: number[]; // [1st_Horse, 2nd_Horse, 3rd_Horse, ...]
}

// 整合一場賽事的所有資料
export interface RaceData {
    raceNumber: number;
    trends: Record<TimePoint, TrendSnapshot>;
    result: RaceResult;
}

// 統計結果的結構
export interface HitRateStats {
    totalRaces: number;
    // 針對每個排名區間 (如 1-2名, 3-4名)
    segments: {
        [key: string]: { // key e.g., "Rank 1-2"
            winHit: number;      // 命中第一名次數
            winRate: number;     // 命中第一名機率
            quinellaHit: number; // 命中第二名次數
            quinellaRate: number;// 命中第二名機率
            placeHit: number;    // 命中入圍(3-6名)次數
            placeRate: number;   // 命中入圍機率
        }
    }
}
