import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { up, down } from './unify-message-collections';

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
    if (db) {
        await db.collection('messages').deleteMany({});
        await db.collection('servermessages').deleteMany({});
    }
});

async function seedServerMessage(overrides: Record<string, unknown> = {}) {
    const db = mongoose.connection.db;
    if (!db) throw new Error('no db connection');
    const doc = {
        snowflakeId: `sm-${Math.random().toString(36).slice(2)}`,
        serverId: 'server1',
        channelId: 'chan1',
        senderId: 'userA',
        text: 'hello channel',
        createdAt: new Date(),
        ...overrides,
    };
    await db.collection('servermessages').insertOne(doc);
    return doc;
}

async function seedDmMessage(overrides: Record<string, unknown> = {}) {
    const db = mongoose.connection.db;
    if (!db) throw new Error('no db connection');
    const doc = {
        snowflakeId: `dm-${Math.random().toString(36).slice(2)}`,
        senderId: 'userA',
        receiverId: 'userB',
        channelId: 'chanDm1',
        text: 'hi',
        createdAt: new Date(),
        ...overrides,
    };
    await db.collection('messages').insertOne(doc);
    return doc;
}

describe('unify-message-collections', () => {
    test('copies every servermessages doc into messages, preserving snowflakeId', async () => {
        const sm1 = await seedServerMessage({ text: 'first' });
        const sm2 = await seedServerMessage({ text: 'second' });

        await up();

        const db = mongoose.connection.db;
        if (!db) throw new Error('no db connection');
        const copied = await db
            .collection('messages')
            .find({ serverId: { $exists: true } })
            .toArray();

        expect(copied).toHaveLength(2);
        expect(copied.map((d) => d.snowflakeId).sort()).toEqual(
            [sm1.snowflakeId, sm2.snowflakeId].sort(),
        );
        expect(
            copied.find((d) => d.snowflakeId === sm1.snowflakeId)?.text,
        ).toBe('first');
    });

    test('does not touch or remove servermessages', async () => {
        await seedServerMessage();

        await up();

        const db = mongoose.connection.db;
        if (!db) throw new Error('no db connection');
        expect(await db.collection('servermessages').countDocuments({})).toBe(
            1,
        );
    });

    test('does not disturb existing DM messages already in messages', async () => {
        const dm = await seedDmMessage();
        await seedServerMessage();

        await up();

        const db = mongoose.connection.db;
        if (!db) throw new Error('no db connection');
        const dmDoc = await db
            .collection('messages')
            .findOne({ snowflakeId: dm.snowflakeId });
        expect(dmDoc).not.toBeNull();
        expect(await db.collection('messages').countDocuments({})).toBe(2);
    });

    test('dry run copies nothing', async () => {
        await seedServerMessage();

        await up({ dryRun: true });

        const db = mongoose.connection.db;
        if (!db) throw new Error('no db connection');
        expect(await db.collection('messages').countDocuments({})).toBe(0);
    });

    test('aborts with zero writes when a snowflakeId collides between collections', async () => {
        const sharedId = 'collide-123';
        await seedDmMessage({ snowflakeId: sharedId });
        await seedServerMessage({ snowflakeId: sharedId });

        await expect(up()).rejects.toThrow(/collision/i);

        const db = mongoose.connection.db;
        if (!db) throw new Error('no db connection');
        expect(await db.collection('messages').countDocuments({})).toBe(1);
    });

    test('down() removes server-origin messages but leaves DM messages and servermessages alone', async () => {
        const dm = await seedDmMessage();
        await seedServerMessage();
        await up();

        await down();

        const db = mongoose.connection.db;
        if (!db) throw new Error('no db connection');
        const remaining = await db.collection('messages').find({}).toArray();
        expect(remaining).toHaveLength(1);
        expect(remaining[0]?.snowflakeId).toBe(dm.snowflakeId);
        expect(await db.collection('servermessages').countDocuments({})).toBe(
            1,
        );
    });
});
