// import fetch from 'node-fetch'; // Use native fetch

const GRAPHQL_URL = 'https://info.cld.hkjc.com/graphql/base/';
const RACING_QUERY = `
query racing($date: String, $venueCode: String, $oddsTypes: [OddsType], $raceNo: Int) {
  raceMeetings(date: $date, venueCode: $venueCode) {
    pmPools(oddsTypes: $oddsTypes, raceNo: $raceNo) {
      id
      status
      sellStatus
      oddsType
      lastUpdateTime
      guarantee
      minTicketCost
      name_en
      name_ch
      leg {
        number
        races
      }
      cWinSelections {
        composite
        name_ch
        name_en
        starters
      }
      oddsNodes {
        combString
        oddsValue
        hotFavourite
        oddsDropValue
        bankerOdds {
          combString
          oddsValue
        }
      }
    }
  }
}
`;

export interface FetchOddsParams {
    date: string;
    venueCode: string;
    raceNo: number;
}

export interface FetchOddsResult {
    pools: any[];
}

export async function fetchOdds(params: FetchOddsParams): Promise<FetchOddsResult> {
    const { date, venueCode, raceNo } = params;
    
    // Default variables
    const variables = {
        date,
        venueCode,
        oddsTypes: ["WIN", "PLA", "QIN", "QPL"], // Fetch standard odds
        raceNo
    };

    try {
        const response = await fetch(GRAPHQL_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://bet.hkjc.com',
                'Referer': 'https://bet.hkjc.com/'
            },
            body: JSON.stringify({
                query: RACING_QUERY,
                variables
            })
        });

        if (!response.ok) {
            throw new Error(`HKJC API Error: ${response.status} ${response.statusText}`);
        }

        const json = await response.json() as any;

        if (json.errors) {
            console.error('GraphQL Errors:', JSON.stringify(json.errors, null, 2));
            throw new Error('GraphQL query returned errors');
        }

        const raceMeetings = json.data?.raceMeetings;
        if (!raceMeetings || raceMeetings.length === 0) {
            return { pools: [] }; // No meeting found
        }

        return {
            pools: raceMeetings[0].pmPools || []
        };

    } catch (error) {
        console.error('Failed to fetch odds:', error);
        throw error;
    }
}

export async function fetchOddsForAllRaces(date: string, venueCode: string) {
    console.log(`Starting bulk fetch for ${date} (${venueCode})...`);
    const results: { raceNo: number, pools: any[] }[] = [];
    
    // HKJC max races is usually 11, rarely 14. We probe 1 to 14.
    // Optimization: If Race 1 fails (no meeting), stop immediately.
    // If Race X has data but Race X+1 is empty, we stop.
    
    for (let i = 1; i <= 14; i++) {
        try {
            const result = await fetchOdds({ date, venueCode, raceNo: i });
            if (result.pools.length === 0) {
                // If Race 1 has no pools, likely the whole meeting is invalid or venue is wrong
                if (i === 1) {
                    console.log(`No pools found for Race 1. Aborting meeting fetch.`);
                    break;
                }
                // If Race X has no pools, we assume end of meeting
                // BUT, sometimes there are gaps? (Unlikely for HKJC)
                // Let's try one more just in case? No, usually sequential.
                console.log(`Race ${i} has no pools. Assuming end of meeting.`);
                break;
            }

            console.log(`Fetched Race ${i}: ${result.pools.length} pools`);
            results.push({ raceNo: i, pools: result.pools });
            
            // Save to DB immediately
            await saveOddsHistory(date, venueCode, i, result.pools);
            
            // Polite delay
            await new Promise(r => setTimeout(r, 500)); 

        } catch (e) {
            console.error(`Error fetching Race ${i}:`, e);
            // If error, maybe retry or skip? 
            // For now, if it's a network error, we might want to stop.
            // But let's continue to try next race just in case.
        }
    }
    
    return results;
}

import prisma from '../lib/prisma';

export async function saveOddsHistory(date: string, venue: string, raceNo: number, pools: any[]) {
    if (!pools || pools.length === 0) return;

    try {
        const hkjcId = `${date}-${venue}-${raceNo}`;
        
        // 1. Ensure Race exists (Lightweight Sync)
        const race = await prisma.race.upsert({
            where: { hkjcId },
            create: {
                hkjcId,
                date,
                venue,
                raceNo
            },
            update: {} // No update needed if exists
        });

        // 2. Extract Odds Data
        let winOdds: Record<string, number> = {};
        let placeOdds: Record<string, number> = {};
        let qinOdds: Record<string, number> = {};
        let qplOdds: Record<string, number> = {};

        pools.forEach(pool => {
            if (pool.sellStatus !== 'SELL' && pool.status !== 'DEFINED') return;
            if (!pool.oddsNodes) return;

            const oddsMap: Record<string, number> = {};
            pool.oddsNodes.forEach((node: any) => {
                oddsMap[node.combString] = parseFloat(node.oddsValue);
            });

            if (pool.oddsType === 'WIN') winOdds = oddsMap;
            else if (pool.oddsType === 'PLA') placeOdds = oddsMap;
            else if (pool.oddsType === 'QIN') qinOdds = oddsMap;
            else if (pool.oddsType === 'QPL') qplOdds = oddsMap;
        });

        // 3. Save History Snapshot
        // Only save if we have at least WIN odds
        if (Object.keys(winOdds).length > 0) {
            await prisma.oddsHistory.create({
                data: {
                    raceId: race.id,
                    winOdds: winOdds as any,
                    placeOdds: placeOdds as any,
                    qinOdds: Object.keys(qinOdds).length > 0 ? (qinOdds as any) : undefined,
                    qplOdds: Object.keys(qplOdds).length > 0 ? (qplOdds as any) : undefined,
                }
            });
            console.log(`Saved odds history for ${hkjcId}`);
        }

    } catch (e) {
        console.error('Failed to save odds history:', e);
    }
}
