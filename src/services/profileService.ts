
import { RaceHorseInfo, scrapeHorseProfile } from '../hkjcScraper';
import { updateHorseProfileInDb } from './dbService';

export async function updateAllHorseProfiles(horses: RaceHorseInfo[]) {
    console.log(`[Background] Starting profile update for ${horses.length} horses...`);
    let updatedCount = 0;
    
    // Deduplicate horses by ID
    const uniqueHorses = new Map<string, RaceHorseInfo>();
    horses.forEach(h => uniqueHorses.set(h.horseId, h));
    const horseList = Array.from(uniqueHorses.values());
    
    console.log(`[Background] Unique horses to process: ${horseList.length}`);

    for (const [index, horse] of horseList.entries()) {
        try {
            // Polite delay
            await new Promise(r => setTimeout(r, 1000));
            
            console.log(`[Background] (${index + 1}/${horseList.length}) Fetching profile for ${horse.name} (${horse.horseId})...`);
            const profile = await scrapeHorseProfile(horse.horseId);
            
            const success = await updateHorseProfileInDb(profile);
            if (success) updatedCount++;
            
        } catch (error) {
            console.error(`[Background] Failed to update profile for ${horse.horseId}:`, error);
        }
    }
    console.log(`[Background] Profile update complete. Updated ${updatedCount} profiles.`);
}
