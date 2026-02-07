
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import prisma from '../lib/prisma';

const BASE_URL = 'https://racing.hkjc.com/zh-hk/local/info/speedpro/speedguide';

export class SpeedProScraper {
    
    private parseDate(dateStr: string): string | null {
        // Input: 08/02/2026
        // Output: 2026-02-08
        const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (match) {
            return `${match[3]}-${match[2]}-${match[1]}`;
        }
        return null;
    }

    private parseVenue(venueStr: string): string {
        if (venueStr.includes('跑馬地') || venueStr.includes('Happy Valley')) return 'HV';
        if (venueStr.includes('沙田') || venueStr.includes('Sha Tin')) return 'ST';
        return 'ST'; // Default
    }

    private parseStatusRating(html: string | null): number | null {
        if (!html) return 0; // Default to 0 if empty
        
        if (html.includes('formGuide_3up')) return 3;
        if (html.includes('formGuide_2up')) return 2;
        if (html.includes('formGuide_1up')) return 1;
        if (html.includes('thumb_down_2')) return -2;
        if (html.includes('thumb_down')) return -1;
        
        return 0;
    }

    async scrapeRace(raceNo: number, browser: any) {
        const url = `${BASE_URL}?raceno=${raceNo}`;
        console.log(`Scraping SpeedPro for Race ${raceNo}: ${url}`);

        const page = await browser.newPage();
        
        try {
            // Set headers to look like a real browser
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
            
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            
            const content = await page.content();
            const $ = cheerio.load(content);
            
            // 1. Extract Date and Venue
            // Strategy: Look for specific date format in text nodes
            const htmlContent = $.root().html() || '';
            const dateMatch = htmlContent.match(/(\d{2})\/(\d{2})\/(\d{4})/); // DD/MM/YYYY
            
            if (!dateMatch) {
                console.log(`Race ${raceNo}: No date found. Assuming race does not exist.`);
                return false;
            }
            
            const dateStr = dateMatch[0];
            const dateIso = this.parseDate(dateStr);
            
            if (!dateIso) {
                console.log(`Race ${raceNo}: Invalid date format ${dateStr}`);
                return false;
            }

            const venueMatch = htmlContent.match(/(沙田|跑馬地|Sha Tin|Happy Valley)/);
            const venueStr = venueMatch ? venueMatch[0] : 'ST'; // Default to ST if not found? Or maybe check context
            const venueCode = this.parseVenue(venueStr);

            console.log(`Race ${raceNo}: Date=${dateIso}, Venue=${venueCode}`);

            // 2. Find the Data Table
            let targetTable = null;
            $('table').each((i, table) => {
                const headers = $(table).text();
                if (headers.includes('馬號') && headers.includes('所需能量')) {
                    targetTable = $(table);
                    return false;
                }
            });

            if (!targetTable) {
                console.log(`Race ${raceNo}: No SpeedPro table found.`);
                return false;
            }

            // 3. Ensure Race exists in DB
            const hkjcId = `${dateIso.replace(/-/g, '')}-${venueCode}-${raceNo}`;
            
            const race = await prisma.race.upsert({
                where: { hkjcId },
                update: {},
                create: {
                    hkjcId,
                    date: dateIso,
                    venue: venueCode,
                    raceNo: raceNo,
                    startTime: new Date(`${dateIso}T12:00:00Z`) // Dummy time, will be updated by other scrapers if needed
                }
            });

            // 4. Parse Rows
            let rowCount = 0;
            const rows = $(targetTable).find('tbody tr');
            
            for (let i = 0; i < rows.length; i++) {
                const cells = $(rows[i]).find('td');
                if (cells.length < 13) continue; // Ensure enough columns

                const horseNoStr = $(cells[0]).text().trim();
                const horseName = $(cells[1]).text().trim();
                const drawStr = $(cells[2]).text().trim();
                const energyReq = $(cells[3]).text().trim();
                const statusHtml = $(cells[11]).html(); // Status Rating HTML
                const assessment = $(cells[12]).text().trim(); // Index 12 based on analysis

                if (!horseNoStr || isNaN(parseInt(horseNoStr))) continue;

                const horseNo = parseInt(horseNoStr);
                const draw = parseInt(drawStr) || null;
                const statusRating = this.parseStatusRating(statusHtml);

                // Save to DB
                await prisma.speedPro.upsert({
                    where: {
                        raceId_horseNo: {
                            raceId: race.id,
                            horseNo
                        }
                    },
                    update: {
                        horseName,
                        draw,
                        energyReq,
                        assessment,
                        statusRating
                    },
                    create: {
                        raceId: race.id,
                        horseNo,
                        horseName,
                        draw,
                        energyReq,
                        assessment,
                        statusRating
                    }
                });
                rowCount++;
            }

            console.log(`Race ${raceNo}: Saved ${rowCount} entries.`);
            return rowCount > 0;

        } catch (error: any) {
            console.error(`Race ${raceNo} Error:`, error.message);
            return false;
        } finally {
            await page.close();
        }
    }

    async scrapeAll() {
        console.log('Starting SpeedPro Scraping...');
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        try {
            for (let raceNo = 1; raceNo <= 14; raceNo++) {
                const success = await this.scrapeRace(raceNo, browser);
                if (!success && raceNo > 5) { // If fail after race 5, assume end of meeting
                    console.log(`Stopped at Race ${raceNo} (no data found).`);
                    break;
                }
            }
        } finally {
            await browser.close();
        }
        console.log('Scraping Completed.');
    }
}
