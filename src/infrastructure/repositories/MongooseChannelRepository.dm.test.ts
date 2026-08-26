import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { Channel } from '@/models/Server';

import { MongooseChannelRepository } from './MongooseChannelRepository';

let mongod: MongoMemoryServer;
let repo: MongooseChannelRepository;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    repo = new MongooseChannelRepository();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

afterEach(async () => {
    await Channel.deleteMany({});
});

describe('MongooseChannelRepository - DM channels', () => {
    test('creates a DM channel without a serverId or name', async () => {
        const channel = await repo.create({
            type: 'dm',
            recipientIds: ['userA', 'userB'],
        });

        expect(channel.serverId).toBeUndefined();
        expect(channel.name).toBeUndefined();
        expect(channel.type).toBe('dm');
        expect(channel.recipientIds).toEqual(['userA', 'userB']);
    });

    test('findDmChannelByRecipients finds an exact match regardless of stored order', async () => {
        const created = await repo.create({
            type: 'dm',
            recipientIds: ['userA', 'userB'],
        });

        const found = await repo.findDmChannelByRecipients(['userA', 'userB']);

        expect(found?.snowflakeId).toBe(created.snowflakeId);
    });

    test('findDmChannelByRecipients does not match a different recipient set', async () => {
        await repo.create({
            type: 'dm',
            recipientIds: ['userA', 'userB'],
        });

        const found = await repo.findDmChannelByRecipients(['userA', 'userC']);

        expect(found).toBeNull();
    });

    test('findDmChannelByRecipients does not match server channels', async () => {
        await repo.create({
            serverId: 'server1',
            name: 'general',
            type: 'text',
            position: 0,
        });

        const found = await repo.findDmChannelByRecipients(['userA', 'userB']);

        expect(found).toBeNull();
    });

    test('findByServerId does not return DM channels', async () => {
        await repo.create({
            type: 'dm',
            recipientIds: ['userA', 'userB'],
        });
        const guildChannel = await repo.create({
            serverId: 'server1',
            name: 'general',
            type: 'text',
            position: 0,
        });

        const results = await repo.findByServerId('server1');

        expect(results.map((c) => c.snowflakeId)).toEqual([
            guildChannel.snowflakeId,
        ]);
    });
});
