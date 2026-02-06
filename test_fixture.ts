
import { FixtureService } from './src/services/fixtureService';

async function test() {
    const service = new FixtureService();
    const fixtures = await service.getRaceFixtures(2025, 2);
    console.log('Fixtures for 2025/02:', fixtures);
}

test();
