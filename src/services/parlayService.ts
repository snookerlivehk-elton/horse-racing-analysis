import prisma from '../lib/prisma';

type SourceType = 'pundit' | 'trend-30' | 'trend-15' | 'trend-10' | 'trend-5' | 'composite' | string;

export class ParlayService {
    async simulateParlay(params: {
        startDate: string;
        endDate: string;
        source: SourceType;
        pickTopK: 1 | 2;
        legs: number;
        mode?: 'win' | 'place';
    }) {
        const { startDate, endDate, source, pickTopK, legs } = params;
        const races = await prisma.race.findMany({
            where: {
                date: { gte: startDate, lte: endDate },
                j18Payouts: { some: {} }
            },
            include: {
                j18Likes: true,
                j18Trends: true,
                j18Payouts: true,
                strategyPicks: true
            },
            orderBy: [{ date: 'asc' }, { raceNo: 'asc' }]
        });

        const byDate = new Map<string, any[]>();
        for (const r of races) {
            const d = r.date;
            if (!byDate.has(d)) byDate.set(d, []);
            byDate.get(d)!.push(r);
        }

        let totalChains = 0;
        let hitChains = 0;
        let netProfit = 0;
        const details: any[] = [];

        for (const [date, list] of Array.from(byDate.entries())) {
            const dayRaces = list.sort((a, b) => a.raceNo - b.raceNo);
            if (dayRaces.length < legs) continue;

            const chainRaces = dayRaces.slice(0, legs);
            let stake = 20;
            let hit = true;
            const path: any[] = [];

            for (const race of chainRaces) {
                const payouts = race.j18Payouts[0]?.payouts as any[];
                if (!payouts || payouts.length === 0) { hit = false; break; }
                const winPool = payouts.find(p => String(p.name).includes('獨贏'));
                if (!winPool || !winPool.list || winPool.list.length === 0) { hit = false; break; }
                const winner = parseInt(winPool.list[0].shengchuzuhe);
                const dividend = parseFloat(String(winPool.list[0].paicai).replace(/,/g, '')) || 0;

                let picks: number[] = [];
                if (source === 'pundit') {
                    if (race.j18Likes[0]) {
                        picks = (race.j18Likes[0].recommendations as unknown as number[]) || [];
                    }
                } else if (source.startsWith('trend-')) {
                    const key = source.split('-')[1];
                    if (race.j18Trends[0]) {
                        const trends = race.j18Trends[0].trends as unknown as Record<string, string[]>;
                        if (trends[key]) picks = trends[key].map(Number);
                    }
                } else if (source === 'composite') {
                    const scores = new Map<number, number>();
                    const scoreMap = [6, 6, 5, 4, 2, 2];
                    if (race.j18Likes[0]) {
                        const arr = race.j18Likes[0].recommendations as unknown as number[];
                        arr?.slice(0, 6).forEach((h, idx) => {
                            const cur = scores.get(h) || 0;
                            scores.set(h, cur + (scoreMap[idx] || 0));
                        });
                    }
                    if (race.j18Trends[0]) {
                        const trends = race.j18Trends[0].trends as unknown as Record<string, string[]>;
                        ['30', '15', '10', '5'].forEach(k => {
                            const arr = trends[k]?.map(Number) || [];
                            arr.slice(0, 6).forEach((h, idx) => {
                                const cur = scores.get(h) || 0;
                                scores.set(h, cur + (scoreMap[idx] || 0));
                            });
                        });
                    }
                    if (scores.size > 0) {
                        picks = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]).map(e => e[0]);
                    }
                } else if (source.startsWith('strategy-')) {
                    const id = source.split('strategy-')[1];
                    const sp = (race.strategyPicks || []).find((s: any) => s.strategyTestId === id);
                    if (sp) picks = sp.picks;
                }

                const top1 = picks[0];
                const top2 = picks[1];
                let legHit = false;
                let usedPick: number | null = null;
                if (winner === top1) { legHit = true; usedPick = top1; }
                else if (pickTopK === 2 && winner === top2) { legHit = true; usedPick = top2; }

                path.push({ raceId: race.id, winner, top1, top2, dividend, legHit });
                if (!legHit) { hit = false; stake = 0; break; }
                stake = dividend;
            }

            if (chainRaces.length === legs) {
                totalChains++;
                if (hit) {
                    hitChains++;
                    netProfit += stake - 20;
                } else {
                    netProfit -= 20;
                }
                details.push({ date, path, hit, finalStake: stake });
            }
        }

        const totalCost = totalChains * 20;
        const roiPct = totalCost > 0 ? parseFloat(((netProfit / totalCost) * 100).toFixed(1)) : 0;

        return { totalChains, hitChains, roiPct, netProfit, details };
    }
}
