
import 'dotenv/config';
import { AnalysisService } from '../src/services/analysisService';

async function testStats() {
    const service = new AnalysisService();
    console.log("Calculating System Stats...");
    const stats = await service.getSystemStats(); // All time
    console.log("System Stats:", stats);
}

testStats();
