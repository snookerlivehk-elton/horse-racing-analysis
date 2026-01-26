import axios from 'axios';
import { RaceData, TimePoint } from './types';

// API 設定
const API_BASE_URL = 'http://your-api-server.com/api'; // 請替換為真實的 API 地址
const API_TIMEOUT = 5000; // 5秒超時

/**
 * 從 API 獲取賽事走勢數據
 * @param date 日期 (YYYY-MM-DD)，可選
 * @param useMock 是否使用模擬數據 (測試用)，預設為 true
 */
export async function fetchRaceTrends(date?: string, useMock: boolean = true): Promise<RaceData[]> {
    if (useMock) {
        console.log('[API Client] 使用模擬數據 (Mock Mode)...');
        return getMockData();
    }

    try {
        console.log(`[API Client] 發送請求至 ${API_BASE_URL}/race-trends...`);
        const response = await axios.get(`${API_BASE_URL}/race-trends`, {
            params: { date },
            timeout: API_TIMEOUT
        });

        // 這裡假設 API 回傳的格式直接符合 RaceData[]，如果不符合，需要在此做轉換 (Mapping)
        // 例如: return response.data.map(transformApiData);
        return response.data as RaceData[];

    } catch (error: any) {
        console.error('[API Client] 請求失敗:', error.message);
        throw error;
    }
}

/**
 * 模擬數據生成器
 * 用於在 API 尚未開發完成時測試分析邏輯
 */
function getMockData(): RaceData[] {
    return [
        {
            raceNumber: 1,
            trends: {
                "30'": { timePoint: "30'", rankings: [8, 2, 4, 11, 6, 14] },
                "15'": { timePoint: "15'", rankings: [8, 2, 4, 11, 6, 14] },
                "10'": { timePoint: "10'", rankings: [8, 2, 4, 11, 6, 14] },
                "5'":  { timePoint: "5'",  rankings: [8, 2, 4, 11, 6, 14] },
                "0'":  { timePoint: "0'",  rankings: [1, 2, 3, 4, 5, 6] }
            },
            result: {
                raceNumber: 1,
                positions: [8, 2, 4, 14, 10, 6] // 1st=8, 2nd=2
            }
        },
        {
            raceNumber: 2,
            trends: {
                "30'": { timePoint: "30'", rankings: [1, 11, 10, 4, 14, 9] },
                "15'": { timePoint: "15'", rankings: [1, 11, 10, 4, 14, 9] },
                "10'": { timePoint: "10'", rankings: [1, 11, 10, 4, 14, 9] },
                "5'":  { timePoint: "5'",  rankings: [1, 11, 10, 4, 14, 9] },
                "0'":  { timePoint: "0'",  rankings: [1, 4, 10, 11, 9, 8] }
            },
            result: {
                raceNumber: 2,
                positions: [1, 4, 10, 11, 9, 8] // 1st=1, 2nd=4
            }
        },
        // ... 可以添加更多模擬場次
    ];
}
