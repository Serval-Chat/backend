import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { Channel } from '@/models/Server';

import { up, down } from './backfill-dm-message-channel-ids';

let mongod: MongoMemoryServer;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

afterEach(async () => {
    const db = mongoose.connection.db;
    if (db) await db.collection('messages').deleteMany({});
    await Channel.deleteMany({});
});

async function seedMessage(senderId: string, receiverId: string) {
    const db = mongoose.connection.db;
    if (!db) throw new Error('no db connection');
    const result = await db
        .collection('messages')
        .insertOne({ senderId, receiverId, text: 'hi', createdAt: new Date() });
    return result.insertedId;
}

describe('backfill-dm-message-channel-ids', () => {
    test('backfills channelId and reuses one channel per conversation regardless of direction', async () => {
        await seedMessage('userA', 'userB');
        await seedMessage('userB', 'userA');
        await seedMessage('userA', 'userC');

        await up();

        const db = mongoose.connection.db;
        if (!db) throw new Error('no db connection');
        const messages = await db
            .collection('messages')
            .find({})
            .sort({ _id: 1 })
            .toArray();

        expect(messages.every((m) => typeof m.channelId === 'string')).toBe(
            true,
        );
        expect(messages[0]?.channelId).toBe(messages[1]?.channelId);
        expect(messages[0]?.channelId).not.toBe(messages[2]?.channelId);

        const channels = await Channel.find({ type: 'dm' }).lean();
        expect(channels).toHaveLength(2);
        expect(
            channels.find(
                (c) =>
                    c.recipientIds?.length === 2 &&
                    c.recipientIds.includes('userA') &&
                    c.recipientIds.includes('userB'),
            ),
        ).toBeDefined();
    });

    test('is idempotent: running up() twice does not create duplicate channels', async () => {
        await seedMessage('userA', 'userB');

        await up();
        await up();

        const channels = await Channel.find({ type: 'dm' }).lean();
        expect(channels).toHaveLength(1);
    });

    test('dry run does not modify messages or create channels', async () => {
        await seedMessage('userA', 'userB');

        await up({ dryRun: true });

        const db = mongoose.connection.db;
        if (!db) throw new Error('no db connection');
        const message = await db.collection('messages').findOne({});
        expect(message?.channelId).toBeUndefined();
        expect(await Channel.countDocuments({})).toBe(0);
    });

    test('down() unsets channelId without deleting the channel', async () => {
        await seedMessage('userA', 'userB');
        await up();

        await down();

        const db = mongoose.connection.db;
        if (!db) throw new Error('no db connection');
        const message = await db.collection('messages').findOne({});
        expect(message?.channelId).toBeUndefined();
        expect(await Channel.countDocuments({ type: 'dm' })).toBe(1);
    });

    test('down() does not strip channelId from server-channel messages', async () => {
        await seedMessage('userA', 'userB');
        await up();

        const db = mongoose.connection.db;
        if (!db) throw new Error('no db connection');
        const serverMessage = await db.collection('messages').insertOne({
            senderId: 'userA',
            serverId: 'server-1',
            channelId: 'server-channel-1',
            text: 'hi from a server channel',
            createdAt: new Date(),
        });

        await down();

        const dmMessage = await db
            .collection('messages')
            .findOne({ receiverId: { $exists: true } });
        expect(dmMessage?.channelId).toBeUndefined();

        const untouchedServerMessage = await db
            .collection('messages')
            .findOne({ _id: serverMessage.insertedId });
        expect(untouchedServerMessage?.channelId).toBe('server-channel-1');
    });
});
