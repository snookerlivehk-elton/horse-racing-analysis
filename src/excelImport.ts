import * as XLSX from 'xlsx';
import { RaceData, TimePoint, TrendSnapshot, RaceResult } from './types';

interface RawRow {
    [key: string]: any;
}

/**
 * 讀取 Excel 並轉換為 RaceData 格式
 * 
 * 假設 Excel 格式 (根據截圖推測):
 * 每一列代表一場賽事 (或一個場次)
 * 
 * 由於實際 Excel 欄位配置可能很複雜 (例如多個時間點並排)，
 * 這裡先提供一個基礎框架，等待您提供真實檔案後進行欄位映射 (Mapping) 的微調。
 */
export function loadRaceDataFromExcel(filePath: string): RaceData[] {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // 假設數據在第一個工作表
    const worksheet = workbook.Sheets[sheetName];
    
    // 將工作表轉換為 JSON 物件陣列
    const rawData: RawRow[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // header: 1 代表回傳二維陣列

    const races: RaceData[] = [];

    // 跳過標題列 (假設前 2 列是標題)
    // TODO: 根據實際 Excel 調整起始列索引
    const startRowIndex = 2; 

    for (let i = startRowIndex; i < rawData.length; i++) {
        const row = rawData[i] as any[];
        
        if (!row || row.length === 0) continue;

        // 假設第 1 欄是場次日期或場次編號
        // 這裡暫時用索引 i 作為賽事編號，直到確認欄位
        const raceNumber = i - startRowIndex + 1;

        // 構建 TrendSnapshot (以 0' 為例，根據截圖)
        // 假設:
        // Col B-G (Index 1-6) = 0' 走勢排名 1-6 名的馬號
        // Col I-N (Index 8-13) = 賽事結果 1-6 名的馬號
        
        // 注意：這需要根據您的 Excel 實際欄位索引 (A=0, B=1, ...) 來修改
        const trend0: TrendSnapshot = {
            timePoint: "0'",
            rankings: [
                parseInt(row[1]), // Rank 1
                parseInt(row[2]), // Rank 2
                parseInt(row[3]), // Rank 3
                parseInt(row[4]), // Rank 4
                parseInt(row[5]), // Rank 5
                parseInt(row[6]), // Rank 6
            ]
        };

        const result: RaceResult = {
            raceNumber: raceNumber,
            positions: [
                parseInt(row[8]),  // 1st Place
                parseInt(row[9]),  // 2nd Place
                parseInt(row[10]), // 3rd Place
                parseInt(row[11]), // 4th Place
                parseInt(row[12]), // 5th Place
                parseInt(row[13]), // 6th Place
            ]
        };

        // 簡單驗證數據完整性
        if (trend0.rankings.some(isNaN) || result.positions.some(isNaN)) {
            // console.warn(`Skipping row ${i + 1} due to missing data`);
            continue;
        }

        races.push({
            raceNumber: raceNumber,
            trends: {
                "0'": trend0,
                // TODO: 這裡需要加入 30', 15', 10', 5' 的讀取邏輯
                "30'": { timePoint: "30'", rankings: [] }, 
                "15'": { timePoint: "15'", rankings: [] },
                "10'": { timePoint: "10'", rankings: [] },
                "5'":  { timePoint: "5'",  rankings: [] },
            },
            result: result
        });
    }

    return races;
}
