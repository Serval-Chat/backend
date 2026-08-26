import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { ChannelRead } from '@/models/ChannelRead';

import { MongooseChannelReadRepository } from './MongooseChannelReadRepository';

let mongod: MongoMemoryServer;
let repo: MongooseChannelReadRepository;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    repo = new MongooseChannelReadRepository();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

afterEach(async () => {
    await ChannelRead.deleteMany({});
});

describe('MongooseChannelReadRepository', () => {
    test('upsert creates a read record when none exists', async () => {
        const result = await repo.upsert('userA', 'chan1');

        expect(result.userId).toBe('userA');
        expect(result.channelId).toBe('chan1');
        expect(result.lastReadAt).toBeInstanceOf(Date);
    });

    test('upsert updates lastReadAt on an existing record instead of duplicating it', async () => {
        const first = await repo.upsert('userA', 'chan1');
        await new Promise((resolve) => setTimeout(resolve, 5));
        const second = await repo.upsert('userA', 'chan1');

        expect(second.lastReadAt.getTime()).toBeGreaterThanOrEqual(
            first.lastReadAt.getTime(),
        );
        const all = await ChannelRead.find({
            userId: 'userA',
            channelId: 'chan1',
        });
        expect(all).toHaveLength(1);
    });

    test('findByUserAndChannel returns null when no record exists', async () => {
        const result = await repo.findByUserAndChannel('userA', 'chan1');
        expect(result).toBeNull();
    });

    test('findByUserId returns all read records for a user across channels', async () => {
        await repo.upsert('userA', 'chan1');
        await repo.upsert('userA', 'chan2');
        await repo.upsert('userB', 'chan1');

        const results = await repo.findByUserId('userA');

        expect(results.map((r) => r.channelId).sort()).toEqual([
            'chan1',
            'chan2',
        ]);
    });
});
