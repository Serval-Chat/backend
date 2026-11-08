import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { Ban } from '@/models/Ban';
import { ServerBan } from '@/models/Server';

import { MongooseBanRepository } from './MongooseBanRepository';
import { MongooseServerBanRepository } from './MongooseServerBanRepository';

let mongod: MongoMemoryServer;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

describe('ban repositories diagnostics', () => {
    it('counts all app bans and returns a bounded sample', async () => {
        const repo = new MongooseBanRepository();
        await Ban.create(
            [1, 2, 3].map((n) => ({
                userId: `u${n}`,
                issuedBy: 'admin',
                reason: 'r',
                timestamp: new Date(),
                expirationTimestamp: new Date(Date.now() + 60_000),
                active: n !== 3,
            })),
        );

        expect(await repo.countAll()).toBe(3);
        expect(await repo.findSample(2)).toHaveLength(2);
    });

    it('counts all server bans and returns a bounded sample', async () => {
        const repo = new MongooseServerBanRepository();
        await ServerBan.create(
            [1, 2, 3].map((n) => ({
                serverId: 's1',
                userId: `u${n}`,
                bannedBy: 'mod',
            })),
        );

        expect(await repo.countAll()).toBe(3);
        expect(await repo.findSample(2)).toHaveLength(2);
    });
});
