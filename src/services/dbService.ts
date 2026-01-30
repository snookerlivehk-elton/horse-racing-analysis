
import prisma from '../lib/prisma';
import { ScrapeResult, HKJC_HEADERS, HorseProfileExtended, HorseProfileRecord } from '../hkjcScraper';

export async function getHorseProfileFromDb(horseId: string): Promise<HorseProfileExtended | null> {
    try {
        const horse = await prisma.horse.findUnique({
            where: { hkjcId: horseId },
            include: {
                performances: {
                    orderBy: {
                        createdAt: 'desc' // Ideally sort by date, but date is string "dd/mm/yy". createdAt is reliable for latest scrape order if inserted sequentially.
                        // Or we can try to parse date later. For now, just return list.
                    }
                }
            }
        });

        if (!horse) return null;

        // Map performances to HorseProfileRecord
        const records: HorseProfileRecord[] = horse.performances.map(p => ({
            raceIndex: p.raceIndex || '',
            rank: p.place || '',
            date: p.date || '',
            distance: p.distance || '',
            venue: p.venue || '',
            course: p.course || '',
            class: p.class || '',
            draw: p.draw || '',
            rating: p.rating || '',
            trainer: p.trainer || '',
            jockey: p.jockey || '',
            weight: p.actualWeight || '',
            odds: p.winOdds || ''
        }));

        return {
            id: horse.hkjcId,
            name: horse.name,
            origin: horse.origin || undefined,
            age: horse.age || undefined,
            color: horse.color || undefined,
            sex: horse.sex || undefined,
            importType: horse.importType || undefined,
            seasonStakes: horse.seasonStakes || undefined,
            totalStakes: horse.totalStakes || undefined,
            record: horse.record || undefined,
            sire: horse.sire || undefined,
            dam: horse.dam || undefined,
            damSire: horse.damSire || undefined,
            owner: horse.owner || undefined,
            trainer: horse.trainer || undefined,
            records: records
        };
    } catch (error) {
        console.error(`Error fetching profile from DB for ${horseId}:`, error);
        return null;
    }
}

export async function updateHorseProfileInDb(profile: HorseProfileExtended) {
    try {
        await prisma.horse.upsert({
            where: { hkjcId: profile.id },
            update: {
                origin: profile.origin,
                age: profile.age,
                color: profile.color,
                sex: profile.sex,
                importType: profile.importType,
                seasonStakes: profile.seasonStakes,
                totalStakes: profile.totalStakes,
                record: profile.record,
                sire: profile.sire,
                dam: profile.dam,
                damSire: profile.damSire,
                owner: profile.owner,
                trainer: profile.trainer
            },
            create: {
                hkjcId: profile.id,
                name: profile.name,
                origin: profile.origin,
                age: profile.age,
                color: profile.color,
                sex: profile.sex,
                importType: profile.importType,
                seasonStakes: profile.seasonStakes,
                totalStakes: profile.totalStakes,
                record: profile.record,
                sire: profile.sire,
                dam: profile.dam,
                damSire: profile.damSire,
                owner: profile.owner,
                trainer: profile.trainer
            }
        });
        return true;
    } catch (error) {
        console.error(`Error updating profile for ${profile.name} (${profile.id}):`, error);
        return false;
    }
}

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

    for (const race of result.races) {
        try {
            // Construct Race ID: YYYYMMDD-Venue-RaceNo
            // Normalize Date: 2026年2月1日 -> 20260201, 2026/02/01 -> 20260201
            let dateStr = result.raceDate || new Date().toISOString().slice(0, 10);
            if (dateStr.includes('年')) {
                const match = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
                if (match) {
                    const [_, y, m, d] = match;
                    dateStr = `${y}${m.padStart(2, '0')}${d.padStart(2, '0')}`;
                }
            } else {
                dateStr = dateStr.replace(/\//g, '').replace(/-/g, '');
            }

            // Normalize Venue: 草地/全天候 -> ST, 跑馬地 -> HV
            let venueCode = 'ST';
            const v = race.venue || 'ST';
            if (v.includes('跑馬地') || v === 'HV' || v === 'Happy Valley') {
                venueCode = 'HV';
            } else if (v.includes('沙田') || v.includes('草地') || v.includes('全天候') || v === 'ST') {
                venueCode = 'ST';
            }

            const raceId = `${dateStr}-${venueCode}-${race.raceNumber}`;

            // Parse Distance (e.g., "1200M" -> 1200)
            let distanceInt: number | null = null;
            if (race.distance) {
                const d = parseInt(race.distance.replace(/\D/g, ''));
                if (!isNaN(d)) distanceInt = d;
            }

            // Extract Class (Simple number or string)
            // race.class might be "Class 4"
            let classStr = race.class;
            if (classStr && classStr.toLowerCase().includes('class')) {
                classStr = classStr.replace(/class/i, '').trim();
            }

            const dbRace = await prisma.race.upsert({
                where: { hkjcId: raceId },
                update: {
                    date: result.raceDate || new Date().toISOString().slice(0, 10),
                    venue: venueCode,
                    raceNo: race.raceNumber,
                    course: race.conditions || race.track, // Store full conditions as course for now
                    distance: distanceInt,
                    class: classStr,
                    trackType: race.track || race.surface // e.g. Turf
                },
                create: {
                    hkjcId: raceId,
                    date: result.raceDate || new Date().toISOString().slice(0, 10),
                    venue: venueCode,
                    raceNo: race.raceNumber,
                    course: race.conditions || race.track,
                    distance: distanceInt,
                    class: classStr,
                    trackType: race.track || race.surface
                }
            });

            // Sync Entries (RaceResult)
            // First, delete existing entries for this race to handle updates/scratches
            await prisma.raceResult.deleteMany({
                where: { raceId: dbRace.id }
            });

            const entries = race.horses.map(h => ({
                raceId: dbRace.id,
                horseNo: parseInt(h.number) || 0,
                horseName: h.name,
                jockey: h.jockey,
                trainer: h.trainer,
                rating: h.rating,
                ratingChange: h.ratingChange,
                weight: h.weight,
                draw: h.draw,
                gear: h.gear
            }));

            if (entries.length > 0) {
                await prisma.raceResult.createMany({
                    data: entries
                });
            }

        } catch (e: any) {
            console.error(`Failed to save race ${race.raceNumber}:`, e);
            errors.push(`Race ${race.raceNumber}: ${e.message}`);
        }
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
                    date: cols[2] || null,
                    course: cols[3] || null,
                    distance: cols[4] || null,
                    venue: cols[5] || null,
                    class: cols[6] || null,
                    draw: cols[7] || null,
                    rating: cols[8] || null,
                    trainer: cols[9] || null,
                    jockey: cols[10] || null,
                    lbw: cols[11] || null,
                    winOdds: cols[12] || null, 
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
