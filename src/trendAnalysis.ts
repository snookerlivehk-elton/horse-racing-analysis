import { RaceData, HitRateStats, TimePoint } from './types';

/**
 * 分析單一時間點的命中率
 * @param races 所有賽事資料
 * @param timePoint 要分析的時間點 (e.g., "0'")
 */
export function analyzeHitRates(races: RaceData[], timePoint: TimePoint): HitRateStats {
    const stats: HitRateStats = {
        totalRaces: races.length,
        segments: {
            "Rank 1-2": { winHit: 0, winRate: 0, quinellaHit: 0, quinellaRate: 0, placeHit: 0, placeRate: 0 },
            "Rank 3-4": { winHit: 0, winRate: 0, quinellaHit: 0, quinellaRate: 0, placeHit: 0, placeRate: 0 },
            "Rank 5-6": { winHit: 0, winRate: 0, quinellaHit: 0, quinellaRate: 0, placeHit: 0, placeRate: 0 },
        }
    };

    races.forEach(race => {
        const trend = race.trends[timePoint];
        if (!trend) return;

        const results = race.result.positions;
        const winner = results[0]; // 第1名馬號
        const second = results[1]; // 第2名馬號
        const places = results.slice(2, 6); // 第3-6名馬號 (入圍)

        // Helper: 檢查馬匹是否在某個結果範圍內
        const checkHit = (horse: number, target: 'win' | 'quinella' | 'place') => {
            if (target === 'win') return horse === winner;
            if (target === 'quinella') return horse === second;
            if (target === 'place') return places.includes(horse);
            return false;
        };

        // 定義要檢查的排名區間 (Indices are 0-based)
        const segments = [
            { name: "Rank 1-2", indices: [0, 1] },
            { name: "Rank 3-4", indices: [2, 3] },
            { name: "Rank 5-6", indices: [4, 5] }
        ];

        segments.forEach(seg => {
            const horsesInSegment = seg.indices.map(i => trend.rankings[i]);
            
            // 統計：該區間內的馬，是否有跑出第一名？
            const hasWin = horsesInSegment.some(h => checkHit(h, 'win'));
            if (hasWin) stats.segments[seg.name].winHit++;

            // 統計：該區間內的馬，是否有跑出第二名？
            const hasQuinella = horsesInSegment.some(h => checkHit(h, 'quinella'));
            if (hasQuinella) stats.segments[seg.name].quinellaHit++;

            // 統計：該區間內的馬，是否有跑出3-6名？
            const hasPlace = horsesInSegment.some(h => checkHit(h, 'place'));
            if (hasPlace) stats.segments[seg.name].placeHit++;
        });
    });

    // 計算百分比
    Object.keys(stats.segments).forEach(key => {
        const seg = stats.segments[key];
        seg.winRate = (seg.winHit / stats.totalRaces) * 100;
        seg.quinellaRate = (seg.quinellaHit / stats.totalRaces) * 100;
        seg.placeRate = (seg.placeHit / stats.totalRaces) * 100;
    });

    return stats;
}

/**
 * 找出在所有時間段 (30' -> 0') 都一直維持在第 1, 2, 3 名的馬匹
 */
export function findConsistentHorses(race: RaceData): { rank1: number[], rank2: number[], rank3: number[] } {
    const timePoints: TimePoint[] = ["30'", "15'", "10'", "5'", "0'"];
    
    // 獲取所有時間點的前3名馬匹
    // Map: RankIndex -> Set of horses that appeared at that rank across all timepoints
    // 但需求是 "一直入圍馬匹第1,2,3名"，通常指 "某匹馬在所有時段都在第1名" 或 "都在前3名"
    // 這裡實作：找出在所有時段都在 Top 3 的馬，並標記它通常所在的排名
    
    // 簡化邏輯：檢查每個時間點的第1名是否是同一匹馬
    const getHorseAtRank = (tp: TimePoint, rankIdx: number) => race.trends[tp]?.rankings[rankIdx];

    // 檢查是否有馬匹在所有時段都佔據第1名 (Rank 0)
    const potentialRank1 = getHorseAtRank("30'", 0);
    const isConsistentRank1 = timePoints.every(tp => getHorseAtRank(tp, 0) === potentialRank1);

    // 檢查是否有馬匹在所有時段都佔據第2名 (Rank 1)
    const potentialRank2 = getHorseAtRank("30'", 1);
    const isConsistentRank2 = timePoints.every(tp => getHorseAtRank(tp, 1) === potentialRank2);
    
    // 檢查是否有馬匹在所有時段都佔據第3名 (Rank 2)
    const potentialRank3 = getHorseAtRank("30'", 2);
    const isConsistentRank3 = timePoints.every(tp => getHorseAtRank(tp, 2) === potentialRank3);

    return {
        rank1: isConsistentRank1 && potentialRank1 ? [potentialRank1] : [],
        rank2: isConsistentRank2 && potentialRank2 ? [potentialRank2] : [],
        rank3: isConsistentRank3 && potentialRank3 ? [potentialRank3] : []
    };
}
