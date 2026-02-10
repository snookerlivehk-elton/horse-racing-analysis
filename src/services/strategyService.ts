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
     * Update an existing strategy by appending/updating picks
     */
    async updateStrategy(id: string, picks: StrategyPickInput[]) {
        try {
            // Use transaction to ensure consistency
            await prisma.$transaction(async (tx) => {
                for (const p of picks) {
                    await tx.strategyPick.upsert({
                        where: {
                            strategyTestId_raceId: {
                                strategyTestId: id,
                                raceId: p.raceId
                            }
                        },
                        update: {
                            picks: p.picks
                        },
                        create: {
                            strategyTestId: id,
                            raceId: p.raceId,
                            picks: p.picks
                        }
                    });
                }
            });
            return { success: true, message: 'Strategy updated successfully' };
        } catch (error: any) {
            console.error('Error updating strategy:', error);
            throw new Error('Failed to update strategy: ' + error.message);
        }
    }

    /**
     * Delete a strategy and its picks
     */
    async deleteStrategy(id: string) {
        try {
            // Cascade delete handles picks usually, but explicit is safer if not configured
            // Prisma schema doesn't show onDelete: Cascade, so we delete picks first
            await prisma.strategyPick.deleteMany({
                where: { strategyTestId: id }
            });
            
            await prisma.strategyTest.delete({
                where: { id }
            });
            
            return { success: true };
        } catch (error: any) {
            console.error('Error deleting strategy:', error);
            throw new Error('Failed to delete strategy: ' + error.message);
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
