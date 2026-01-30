import axios from 'axios';
import * as cheerio from 'cheerio';
import prisma from '../lib/prisma';

const BASE_URL = 'https://racing.hkjc.com/zh-hk/local/information/localtrackwork';

interface ScrapeOptions {
    date: string; // YYYY/MM/DD
    venue: string; // ST, HV
    raceNo: number;
}

export async function scrapeRaceTrackwork({ date, venue, raceNo }: ScrapeOptions) {
    const url = `${BASE_URL}?racedate=${date}&Racecourse=${venue}&RaceNo=${raceNo}`;
    console.log(`Scraping trackwork from: ${url}`);

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://racing.hkjc.com'
            }
        });

        const $ = cheerio.load(response.data);
        const rows = $('table.table_bd.f_fs13 tr'); // Based on previous debug
        
        // Skip header row
        const dataRows = rows.slice(1);
        
        let count = 0;

        for (let i = 0; i < dataRows.length; i++) {
            const tr = dataRows[i];
            const cells = $(tr).find('td');
            
            if (cells.length < 8) continue; // Ensure enough columns

            // 1. Horse Info (Col 1)
            // Extract Horse Name and ID from link
            const horseLink = $(cells[1]).find('a').attr('href');
            const horseName = $(cells[1]).text().trim().split(' ')[0]; // "展雄威 廖康銘..." -> "展雄威"
            
            // console.log(`Debug: ${horseName} Link: ${horseLink}`); 
            
            // Link format: /zh-hk/local/information/horse?horseId=HK_2023_J405
            let hkjcId = '';
            if (horseLink) {
                // Regex modified to be case-insensitive for 'horseId'
                const match = horseLink.match(/horseId=([^&]+)/i);
                if (match) hkjcId = match[1];
            }

            if (!hkjcId) {
                console.warn(`Could not find HKJC ID for horse ${horseName}`);
                continue;
            }

            // Ensure Horse exists
            const horse = await prisma.horse.upsert({
                where: { hkjcId },
                update: { name: horseName }, // Update name just in case
                create: {
                    hkjcId,
                    name: horseName
                }
            });

            // 2. Barrier Trials (Col 2)
            // Format: "23/01: 第3組 1050 沙田 全天候 1/8(布文) 15.9 22.1 23.7 (1.01.76)"
            const trialsHtml = $(cells[2]).html() || '';
            const trials = trialsHtml.split('<br>').map(t => $(`<div>${t}</div>`).text().trim()).filter(t => t);

            for (const trialRaw of trials) {
                // Parse trial string
                // Example: 23/01: 第3組 1050 沙田 全天候 1/8(布文) ...
                const dateMatch = trialRaw.match(/^(\d{2}\/\d{2}):/);
                if (!dateMatch) continue;

                const trialDate = dateMatch[1]; // 23/01
                
                // Avoid duplicates
                const existingTrial = await prisma.barrierTrial.findFirst({
                    where: {
                        horseId: horse.id,
                        date: trialDate,
                        raw: trialRaw
                    }
                });

                if (!existingTrial) {
                    // Simple parsing for now, store raw mainly
                    // Try to extract rank/total: "1/8"
                    const rankMatch = trialRaw.match(/ (\d+)\/(\d+)\(/);
                    const rank = rankMatch ? parseInt(rankMatch[1]) : null;
                    const totalHorses = rankMatch ? parseInt(rankMatch[2]) : null;
                    
                    // Try to extract finish time: "(1.01.76)"
                    const timeMatch = trialRaw.match(/\((\d+\.\d+\.\d+)\)$/);
                    const finishTime = timeMatch ? timeMatch[1] : null;

                    await prisma.barrierTrial.create({
                        data: {
                            horseId: horse.id,
                            date: trialDate,
                            raw: trialRaw,
                            rank,
                            totalHorses,
                            finishTime
                        }
                    });
                }
            }

            // 3. Trackwork - Trotting/Gallop (Col 4)
            const trackworkHtml = $(cells[4]).html() || '';
            const trackworks = parseTrackworkCell($, trackworkHtml);
            
            for (const tw of trackworks) {
                 await saveTrackwork(horse.id, tw);
            }

            // 4. Trackwork - Swim/Machine (Col 6 usually? Need to check debug output)
            // Debug output showed Col 6 has Machine work: "29/01: 沙田 馬匹跑步機..."
            // Let's assume Col 6 is machine/swim based on structure
            const otherWorkHtml = $(cells[6]).html() || '';
            const otherWorks = parseTrackworkCell($, otherWorkHtml);

             for (const tw of otherWorks) {
                 await saveTrackwork(horse.id, tw);
            }

            count++;
        }
        
        console.log(`Successfully processed ${count} horses for race ${venue} #${raceNo}`);
        return count;

    } catch (error) {
        console.error('Error scraping trackwork:', error);
        throw error;
    }
}

function parseTrackworkCell($: any, html: string) {
    // Format: <b>29/01:</b> 沙田 內圈 倒快一圈 (助手)
    // Split by <br>
    const lines = html.split('<br>').map(line => {
        const el = $(`<div>${line}</div>`);
        const dateEl = el.find('b');
        if (dateEl.length === 0) return null;
        
        const date = dateEl.text().replace(':', '').trim(); // 29/01
        // Remove the date part from full text to get description
        // Text is likely "29/01: 沙田 ..."
        let fullText = el.text().trim();
        let desc = fullText.replace(date + ':', '').trim();
        
        // Determine type and venue from description
        let type = '其他';
        if (desc.includes('快操')) type = '快操';
        else if (desc.includes('踱步')) type = '踱步';
        else if (desc.includes('倒快')) type = '倒快'; // Usually grouped with fast work
        else if (desc.includes('游泳')) type = '游泳';
        else if (desc.includes('機')) type = '機操'; // e.g. 跑步機

        let venue = '沙田';
        if (desc.includes('從化')) venue = '從化';
        else if (desc.includes('內圈')) venue = '內圈';
        else if (desc.includes('全天候')) venue = '全天候';
        else if (desc.includes('草地')) venue = '草地';
        
        return {
            date,
            type,
            venue,
            description: desc
        };
    }).filter(x => x !== null);
    
    return lines;
}

async function saveTrackwork(horseId: string, tw: any) {
    // Avoid duplicates
    const existing = await prisma.trackwork.findFirst({
        where: {
            horseId,
            date: tw.date,
            description: tw.description
        }
    });

    if (!existing) {
        await prisma.trackwork.create({
            data: {
                horseId,
                date: tw.date,
                type: tw.type,
                venue: tw.venue,
                description: tw.description
            }
        });
    }
}
