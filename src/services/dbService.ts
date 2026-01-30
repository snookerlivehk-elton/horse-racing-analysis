
import prisma from '../lib/prisma';
import { ScrapeResult, HKJC_HEADERS, HorseProfileExtended, HorseProfileRecord } from '../hkjcScraper';

export async function getHorseProfileFromDb(horseId: string): Promise<HorseProfileExtended | null> {
    try {
        const horse = await prisma.horse.findUnique({
            where: { hkjcId: horseId },
            include: {
                performances: true
            }
        });

        if (!horse) return null;

        // Map performances to HorseProfileRecord
        let records: HorseProfileRecord[] = horse.performances.map(p => ({
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
            odds: p.winOdds || '',
            runningPosition: p.runningPosition || '',
            finishTime: p.finishTime || '',
            horseWeight: p.horseWeight || '',
            gear: p.gear || ''
        }));

        // Sort by Date Descending (Newest First)
        records.sort((a, b) => {
            const parseDate = (d: string) => {
                const parts = d.split('/');
                if (parts.length !== 3) return 0;
                // dd/mm/yy -> 20yy-mm-dd (Assume 20xx)
                return new Date(`20${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
            };
            return parseDate(b.date) - parseDate(a.date);
        });

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

    // Build a map of horse metadata from the racecard
    const horseMetadata = new Map<string, { age?: string, sex?: string, color?: string, rating?: string, trainer?: string, owner?: string, sire?: string, dam?: string }>();
    for (const race of result.races) {
        for (const h of race.horses) {
            if (!horseMetadata.has(h.horseId)) {
                horseMetadata.set(h.horseId, {
                    age: h.age,
                    sex: h.sex,
                    rating: h.rating,
                    trainer: h.trainer
                });
            }
        }
    }

    for (const horse of result.horses) {
        try {
            // Determine type and extract ID/Name
            const isProfile = 'records' in horse;
            const hId = isProfile ? (horse as any).id : (horse as any).horseId;
            const hName = isProfile ? (horse as any).name : (horse as any).horseName;
            
            // Get Metadata from Profile if available, else fallback to Map
            const metaFromProfile = isProfile ? (horse as any) : {};
            const metaFromMap = horseMetadata.get(hId);
            
            const finalMeta = {
                age: metaFromProfile.age || metaFromMap?.age,
                sex: metaFromProfile.sex || metaFromMap?.sex,
                origin: metaFromProfile.origin,
                color: metaFromProfile.color,
                importType: metaFromProfile.importType,
                seasonStakes: metaFromProfile.seasonStakes,
                totalStakes: metaFromProfile.totalStakes,
                record: metaFromProfile.record,
                sire: metaFromProfile.sire,
                dam: metaFromProfile.dam,
                damSire: metaFromProfile.damSire,
                owner: metaFromProfile.owner,
                trainer: metaFromProfile.trainer || metaFromMap?.trainer
            };
            
            // 1. Upsert Horse
            const dbHorse = await prisma.horse.upsert({
                where: { hkjcId: hId },
                update: { 
                    name: hName,
                    ...(finalMeta.age ? { age: finalMeta.age } : {}),
                    ...(finalMeta.sex ? { sex: finalMeta.sex } : {}),
                    ...(finalMeta.origin ? { origin: finalMeta.origin } : {}),
                    ...(finalMeta.color ? { color: finalMeta.color } : {}),
                    ...(finalMeta.importType ? { importType: finalMeta.importType } : {}),
                    ...(finalMeta.seasonStakes ? { seasonStakes: finalMeta.seasonStakes } : {}),
                    ...(finalMeta.totalStakes ? { totalStakes: finalMeta.totalStakes } : {}),
                    ...(finalMeta.record ? { record: finalMeta.record } : {}),
                    ...(finalMeta.sire ? { sire: finalMeta.sire } : {}),
                    ...(finalMeta.dam ? { dam: finalMeta.dam } : {}),
                    ...(finalMeta.damSire ? { damSire: finalMeta.damSire } : {}),
                    ...(finalMeta.owner ? { owner: finalMeta.owner } : {}),
                    ...(finalMeta.trainer ? { trainer: finalMeta.trainer } : {})
                },
                create: {
                    hkjcId: hId,
                    name: hName,
                    age: finalMeta.age,
                    sex: finalMeta.sex,
                    origin: finalMeta.origin,
                    color: finalMeta.color,
                    importType: finalMeta.importType,
                    seasonStakes: finalMeta.seasonStakes,
                    totalStakes: finalMeta.totalStakes,
                    record: finalMeta.record,
                    sire: finalMeta.sire,
                    dam: finalMeta.dam,
                    damSire: finalMeta.damSire,
                    owner: finalMeta.owner,
                    trainer: finalMeta.trainer
                }
            });

            // 2. Insert Performances
            // Map rows based on source type
            const rows = isProfile ? (horse as any).records.map((r: any) => ({
                 columns: [
                    r.raceIndex, r.rank, r.date, r.course, r.distance, 
                    r.venue, r.class, r.draw, r.rating, r.trainer, 
                    r.jockey, '-', r.odds, r.weight, 
                    r.runningPosition || '', r.finishTime || '', r.horseWeight || '', r.gear || ''
                ]
            })) : (horse as any).rows;

            // Only update performances if we actually found some
            if (rows && rows.length > 0) {
                await prisma.racePerformance.deleteMany({
                    where: { horseId: dbHorse.id }
                });

                const performanceCreates = rows.map((row: any) => {
                    const cols = row.columns;
                    // Mapping based on HKJC_HEADERS index
                    // 0:Index 1:Rank 2:Date 3:Course 4:Dist 5:Going 6:Class 7:Draw 8:Rtg 9:Tnr 10:Jky 11:LBW 12:Odds 13:Wt 14:RP 15:Time 16:HWt 17:Gear
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
            } else {
                console.log(`Skipping performance update for ${hName} (${hId}) - no records found.`);
            }

            savedCount++;
        } catch (e: any) {
            const hId = 'records' in horse ? (horse as any).id : (horse as any).horseId;
            console.error(`Failed to save horse ${hId}:`, e);
            errors.push(`Horse ${hId}: ${e.message}`);
        }
    }

    return { savedCount, errors };
}
