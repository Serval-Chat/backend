import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { Ping } from '@/models/Ping';

import { MongoosePingRepository } from './MongoosePingRepository';

let mongod: MongoMemoryServer;
let repo: MongoosePingRepository;

const pingData = {
    userId: '0244871598790672384',
    type: 'mention' as const,
    sender: 'cat',
    senderId: '0244871598790672384',
    serverId: '0314440862954160128',
    channelId: '0314447146336124928',
    messageId: '0362009044010926080',
    message: {
        messageId: '0362009044010926080',
        text: 'hello',
        createdAt: '2026-09-25T22:54:41.894Z',
    },
};

const OTHER_USER = '0265935371727011840';

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    repo = new MongoosePingRepository();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

afterEach(async () => {
    await Ping.deleteMany({});
});

describe('MongoosePingRepository', () => {
    test('create assigns a snowflake id to an upsert-inserted ping', async () => {
        const created = await repo.create(pingData);

        expect(created.snowflakeId).toMatch(/^\d{19}$/);

        const persisted = await Ping.findOne({ _id: created._id }).lean();
        expect(persisted?.snowflakeId).toBe(created.snowflakeId);
    });

    test('create keeps the original id when the ping already exists', async () => {
        const first = await repo.create(pingData);
        const second = await repo.create(pingData);

        expect(second.snowflakeId).toBe(first.snowflakeId);
        const all = await Ping.find({ messageId: pingData.messageId }).lean();
        expect(all).toHaveLength(1);
    });

    test('delete only removes a ping owned by the requesting user', async () => {
        const created = await repo.create(pingData);

        expect(await repo.delete(created.snowflakeId, OTHER_USER)).toBe(false);
        expect(await Ping.countDocuments({})).toBe(1);

        expect(await repo.delete(created.snowflakeId, pingData.userId)).toBe(
            true,
        );
        expect(await Ping.countDocuments({})).toBe(0);
    });
});
