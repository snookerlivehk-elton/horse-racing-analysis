
import prisma from '../lib/prisma';
import { ScrapeResult, HKJC_HEADERS } from '../hkjcScraper';

export async function saveScrapeResultToDb(result: ScrapeResult): Promise<{ savedCount: number, errors: string[] }> {
    let savedCount = 0;
    const errors: string[] = [];

    // Check if DB is connected (simple check)
    try {
        await prisma.$queryRaw`SELECT 1`;
    } catch (e: any) {
        console.warn('Database connection failed. Skipping DB save.', e.message);
        return { savedCount: 0, errors: ['Database not connected'] };
    }

    for (const horse of result.horses) {
        try {
            // 1. Upsert Horse
            const dbHorse = await prisma.horse.upsert({
                where: { hkjcId: horse.horseId },
                update: { name: horse.horseName },
                create: {
                    hkjcId: horse.horseId,
                    name: horse.horseName
                }
            });

            // 2. Insert Performances (avoid duplicates if possible, but for now we just insert)
            // To be safe, we might want to delete old records for this horse or just append?
            // "Upserting" performances is tricky without a unique composite key.
            // For now, let's delete existing performances for this horse to avoid duplication on re-scrape
            // OR we can just ignore for this MVP version. 
            // Better approach: Check if performance exists by raceDate + raceIndex + horseId?
            // Since we don't have a structured object yet, let's just insert all and handle duplicates later or clear old.
            // Strategy: Clear all previous performances for this horse and re-insert (easiest for syncing)
            
            await prisma.racePerformance.deleteMany({
                where: { horseId: dbHorse.id }
            });

            const performanceCreates = horse.rows.map(row => {
                const cols = row.columns;
                // Mapping based on HKJC_HEADERS index
                // "場次"(0), "名次"(1), "日期"(2), "跑道/賽道"(3), "路程"(4), 
                // "場地"(5), "班次"(6), "檔位"(7), "評分"(8), "練馬師"(9), 
                // "騎師"(10), "頭馬距離"(11), "獨贏賠率"(12), "實際負磅"(13), 
                // "沿途走位"(14), "完成時間"(15), "馬匹體重"(16), "配備"(17)

                return {
                    horseId: dbHorse.id,
                    raceIndex: cols[0] || null,
                    place: cols[1] || null,
                    raceDate: cols[2] || null,
                    course: cols[3] || null,
                    distance: cols[4] || null,
                    venue: cols[5] || null,
                    class: cols[6] || null,
                    draw: cols[7] || null,
                    rating: cols[8] || null,
                    trainer: cols[9] || null,
                    jockey: cols[10] || null,
                    lbw: cols[11] || null,
                    odds: cols[12] || null,
                    actualWeight: cols[13] || null,
                    runningPosition: cols[14] || null,
                    finishTime: cols[15] || null,
                    horseWeight: cols[16] || null,
                    gear: cols[17] || null
                };
            });

            if (performanceCreates.length > 0) {
                await prisma.racePerformance.createMany({
                    data: performanceCreates
                });
            }

            savedCount++;
        } catch (e: any) {
            console.error(`Failed to save horse ${horse.horseId}:`, e);
            errors.push(`Horse ${horse.horseId}: ${e.message}`);
        }
    }

    return { savedCount, errors };
}
