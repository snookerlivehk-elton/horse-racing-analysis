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

/**
 * 分析「落飛/回飛」異動
 * 比較 30' 與 0' 的排名變化
 */
import { MoverStats, QuinellaStats } from './types';

export function analyzeBigMovers(races: RaceData[]): MoverStats[] {
    // 定義類別容器
    const categories = {
        "big_drop": { name: "大幅落飛 (排名提升 >4)", count: 0, win: 0, place: 0 }, // 30'排名 - 0'排名 > 4
        "drop": { name: "落飛 (排名提升 2-4)", count: 0, win: 0, place: 0 },      // 30'排名 - 0'排名 介於 2-4
        "stable": { name: "平穩 (排名變動 ±1)", count: 0, win: 0, place: 0 },    // 絕對值 <= 1
        "rise": { name: "回飛 (排名下跌 2-4)", count: 0, win: 0, place: 0 },      // 0'排名 - 30'排名 介於 2-4
        "big_rise": { name: "大幅回飛 (排名下跌 >4)", count: 0, win: 0, place: 0 } // 0'排名 - 30'排名 > 4
    };

    races.forEach(race => {
        const startTrend = race.trends["30'"];
        const endTrend = race.trends["0'"];
        
        if (!startTrend || !endTrend) return;

        // 建立馬匹排名 Map
        const startRankMap = new Map<number, number>(); // horse -> rank index
        startTrend.rankings.forEach((h, i) => startRankMap.set(h, i));

        const endRankMap = new Map<number, number>();
        endTrend.rankings.forEach((h, i) => endRankMap.set(h, i));

        const resultPos = race.result.positions;
        const winner = resultPos[0];
        const top3 = resultPos.slice(0, 3); // 傳統三甲

        // 遍歷所有在 0' 出現的馬匹 (假設馬匹名單一致)
        endRankMap.forEach((endRank, horse) => {
            const startRank = startRankMap.get(horse);
            if (startRank === undefined) return;

            // Rank Index 越小排名越高 (0 is 1st). 
            // Improvement = StartIndex - EndIndex. (e.g., Was 10th(idx 9), Now 2nd(idx 1) => 9 - 1 = 8 > 0)
            const diff = startRank - endRank;

            let catKey = "stable";
            if (diff > 4) catKey = "big_drop";
            else if (diff >= 2) catKey = "drop";
            else if (diff <= -5) catKey = "big_rise";
            else if (diff <= -2) catKey = "rise";

            // Update stats
            const cat = categories[catKey as keyof typeof categories];
            cat.count++;
            if (horse === winner) cat.win++;
            if (top3.includes(horse)) cat.place++;
        });
    });

    // 轉換為陣列並計算百分比
    return Object.values(categories).map(c => ({
        category: c.name,
        count: c.count,
        winCount: c.win,
        winRate: c.count > 0 ? (c.win / c.count) * 100 : 0,
        placeCount: c.place,
        placeRate: c.count > 0 ? (c.place / c.count) * 100 : 0
    }));
}

/**
 * 分析連贏位 (Quinella) 結構
 * 基於 0' (臨場) 排名分析 Q 的組成
 */
export function analyzeQuinellaComposition(races: RaceData[]): QuinellaStats[] {
    const stats: Record<string, number> = {
        "1-2 + 1-2": 0,    // 熱熱
        "1-2 + 3-4": 0,    // 熱中
        "1-2 + 5+": 0,     // 熱冷
        "3-4 + 3-4": 0,    // 中中
        "3-4 + 5+": 0,     // 中冷
        "5+ + 5+": 0       // 冷冷
    };

    let validRaces = 0;

    races.forEach(race => {
        const trend = race.trends["0'"];
        if (!trend) return;

        const rankings = trend.rankings; // [Rank1Horse, Rank2Horse, ...]
        const winner = race.result.positions[0];
        const second = race.result.positions[1];

        // 找出冠亞軍在 0' 時的排名索引
        const winnerRankIdx = rankings.indexOf(winner);
        const secondRankIdx = rankings.indexOf(second);

        if (winnerRankIdx === -1 || secondRankIdx === -1) return;

        validRaces++;

        // Helper to categorize rank
        const getCat = (idx: number) => {
            if (idx <= 1) return 1; // Rank 1-2
            if (idx <= 3) return 2; // Rank 3-4
            return 3;               // Rank 5+
        };

        const wCat = getCat(winnerRankIdx);
        const sCat = getCat(secondRankIdx);

        // Sort to ensure "1-2 + 3-4" is same as "3-4 + 1-2"
        const pair = [wCat, sCat].sort((a, b) => a - b);
        
        let key = "";
        if (pair[0] === 1 && pair[1] === 1) key = "1-2 + 1-2";
        else if (pair[0] === 1 && pair[1] === 2) key = "1-2 + 3-4";
        else if (pair[0] === 1 && pair[1] === 3) key = "1-2 + 5+";
        else if (pair[0] === 2 && pair[1] === 2) key = "3-4 + 3-4";
        else if (pair[0] === 2 && pair[1] === 3) key = "3-4 + 5+";
        else key = "5+ + 5+";

        stats[key]++;
    });

    return Object.entries(stats).map(([key, count]) => ({
        category: key,
        count: count,
        rate: validRaces > 0 ? (count / validRaces) * 100 : 0
    }));
}
