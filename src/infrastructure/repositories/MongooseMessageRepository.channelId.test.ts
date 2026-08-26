import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { Message } from '@/models/Message';

import { MongooseMessageRepository } from './MongooseMessageRepository';

let mongod: MongoMemoryServer;
let repo: MongooseMessageRepository;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    repo = new MongooseMessageRepository();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

afterEach(async () => {
    await Message.deleteMany({});
});

describe('MongooseMessageRepository.findByChannelId', () => {
    test('returns only messages in the given channel, oldest first', async () => {
        const chanA = await repo.create({
            senderId: 'userA',
            receiverId: 'userB',
            channelId: 'chanA',
            text: 'first',
        });
        const chanA2 = await repo.create({
            senderId: 'userB',
            receiverId: 'userA',
            channelId: 'chanA',
            text: 'second',
        });
        await repo.create({
            senderId: 'userA',
            receiverId: 'userC',
            channelId: 'chanB',
            text: 'other conversation',
        });

        const results = await repo.findByChannelId('chanA');

        expect(results.map((m) => m.snowflakeId)).toEqual([
            chanA.snowflakeId,
            chanA2.snowflakeId,
        ]);
    });

    test('respects limit and pagination via before', async () => {
        const first = await repo.create({
            senderId: 'userA',
            receiverId: 'userB',
            channelId: 'chanA',
            text: '1',
        });
        await new Promise((resolve) => setTimeout(resolve, 5));
        const second = await repo.create({
            senderId: 'userA',
            receiverId: 'userB',
            channelId: 'chanA',
            text: '2',
        });

        const page = await repo.findByChannelId('chanA', 1);
        expect(page.map((m) => m.snowflakeId)).toEqual([second.snowflakeId]);

        const olderPage = await repo.findByChannelId(
            'chanA',
            50,
            second.snowflakeId,
        );
        expect(olderPage.map((m) => m.snowflakeId)).toEqual([
            first.snowflakeId,
        ]);
    });
});
