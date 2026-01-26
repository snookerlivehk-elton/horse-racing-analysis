import express from 'express';
import * as path from 'path';
import { fetchRaceTrends } from './apiClient';
import { analyzeHitRates, analyzeBigMovers, analyzeQuinellaComposition } from './trendAnalysis';
import { HitRateStats, TimePoint, MoverStats, QuinellaStats } from './types';

const app = express();
const PORT = process.env.PORT || 3000;

// 設定 EJS 為視圖引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

app.get('/', async (req, res) => {
    try {
        // 1. 獲取數據 (目前使用 Mock)
        // TODO: 上線時將 useMock 改為 false，並確認 API_BASE_URL
        const useMock = true;
        const races = await fetchRaceTrends(undefined, useMock);

        // 2. 分析各個時間點
        const timePoints: TimePoint[] = ["30'", "15'", "10'", "5'", "0'"];
        const analysisResults: { timePoint: TimePoint; stats: HitRateStats }[] = [];

        // 這裡為了演示，我們只針對有數據的時間點進行分析
        // Mock Data 目前每個時間點都有資料
        timePoints.forEach(tp => {
            const stats = analyzeHitRates(races, tp);
            analysisResults.push({ timePoint: tp, stats });
        });

        // 3. 新增分析：落飛異動 & Q結構
        const moverStats: MoverStats[] = analyzeBigMovers(races);
        const quinellaStats: QuinellaStats[] = analyzeQuinellaComposition(races);

        // 4. 渲染頁面
        res.render('index', { 
            racesCount: races.length,
            results: analysisResults,
            moverStats,
            quinellaStats,
            lastUpdated: new Date().toLocaleString(),
            serverVersion: VERSION
        });

    } catch (error: any) {
        console.error('Error:', error);
        res.status(500).send(`Server Error: ${error.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
