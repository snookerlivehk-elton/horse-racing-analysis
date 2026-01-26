import { fetchRaceTrends } from './apiClient';
import { analyzeHitRates } from './trendAnalysis';

// 主程式入口
async function main() {
    console.log('==================================================');
    console.log('綜合走勢分析報告 (Trend Analysis - API Mode)');
    console.log('==================================================');

    try {
        // 1. 獲取數據
        // 第一個參數是日期 (例如 '2026-01-26')，這裡傳 undefined 代表當日
        // 第二個參數 true 代表使用模擬數據 (Mock Mode)，改為 false 即可連接真實 API
        const useMock = true; 
        const races = await fetchRaceTrends(undefined, useMock);

        console.log(`\n成功獲取 ${races.length} 場賽事數據。\n`);

        if (races.length === 0) {
            console.log('沒有賽事數據。');
            return;
        }

        // 2. 執行分析 (以 0' 為例)
        const timePoint = "0'";
        const stats = analyzeHitRates(races, timePoint);

        // 3. 輸出報告
        console.log(`[時間點: ${timePoint}] 統計結果:`);
        console.table(
            Object.entries(stats.segments).reduce((acc: any, [key, val]: [string, any]) => {
                acc[key] = {
                    "第一名命中": `${val.winHit}次 (${val.winRate.toFixed(1)}%)`,
                    "第二名命中": `${val.quinellaHit}次 (${val.quinellaRate.toFixed(1)}%)`,
                    "入圍命中": `${val.placeHit}次 (${val.placeRate.toFixed(1)}%)`
                };
                return acc;
            }, {} as any)
        );

    } catch (error) {
        console.error('執行過程中發生錯誤:', error);
    }
}

main();
