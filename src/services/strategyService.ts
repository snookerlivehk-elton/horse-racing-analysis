import prisma from '../lib/prisma';

interface StrategyPickInput {
    raceId: string;
    picks: number[]; // Array of horse numbers
}

export class StrategyService {
    /**
     * Save a new strategy test result
     */
    async saveStrategy(name: string, criteria: string, picks: StrategyPickInput[]) {
        try {
            // Create the strategy test entry
            const strategy = await prisma.strategyTest.create({
                data: {
                    name,
                    criteria,
                    picks: {
                        create: picks.map(p => ({
                            raceId: p.raceId,
                            picks: p.picks
                        }))
                    }
                },
                include: {
                    picks: true
                }
            });
            return { success: true, data: strategy };
        } catch (error: any) {
            console.error('Error saving strategy:', error);
            throw new Error('Failed to save strategy: ' + error.message);
        }
    }

    /**
     * Get all strategies
     */
    async getAllStrategies() {
        return prisma.strategyTest.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { picks: true }
                }
            }
        });
    }
}
