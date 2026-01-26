import { loadRaceDataFromExcel } from './excelImport';
import { analyzeHitRates } from './trendAnalysis';
import * as path from 'path';

// 設定 Excel 檔案路徑 (請修改為您的檔案名稱)
const EXCEL_FILENAME = 'data.xlsx'; 
const filePath = path.join(__dirname, '../', EXCEL_FILENAME);

console.log(`正在讀取數據: ${filePath}...`);

try {
    const races = loadRaceDataFromExcel(filePath);
    console.log(`成功讀取 ${races.length} 場賽事數據。`);

    if (races.length > 0) {
        console.log('\n==================================================');
        console.log('綜合走勢分析報告 (Trend Analysis Report)');
        console.log('==================================================');

        // 分析 0' (開跑前) 的數據
        const stats0 = analyzeHitRates(races, "0'");
        
        console.log(`\n[時間點: 0' (開跑前)]`);
        console.table(
            Object.entries(stats0.segments).reduce((acc, [key, val]) => {
                acc[key] = {
                    "第一名命中率": `${val.winRate.toFixed(2)}%`,
                    "第二名命中率": `${val.quinellaRate.toFixed(2)}%`,
                    "入圍(3-6名)命中率": `${val.placeRate.toFixed(2)}%`
                };
                return acc;
            }, {} as any)
        );

        // 您可以在此添加其他時間點的分析
        // const stats30 = analyzeHitRates(races, "30'");
        // ...
        
    } else {
        console.log('警告: 未找到有效的賽事數據，請檢查 Excel 格式。');
    }

} catch (error: any) {
    if (error.code === 'ENOENT') {
        console.error(`錯誤: 找不到檔案 ${EXCEL_FILENAME}。請確認檔案已放入專案根目錄。`);
    } else {
        console.error('發生錯誤:', error);
    }
}
