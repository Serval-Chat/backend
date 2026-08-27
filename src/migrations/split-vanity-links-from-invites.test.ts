import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { up, down } from './split-vanity-links-from-invites';

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
        await db.collection('invites').deleteMany({});
        await db.collection('vanitylinks').deleteMany({});
    }
});

async function seedInvite(overrides: Record<string, unknown> = {}) {
    const db = mongoose.connection.db;
    if (!db) throw new Error('no db connection');
    const doc = {
        serverId: 'server1',
        code: Math.random().toString(36).slice(2, 10),
        createdByUserId: 'userA',
        uses: 0,
        createdAt: new Date(),
        ...overrides,
    };
    await db.collection('invites').insertOne(doc);
    return doc;
}

describe('split-vanity-links-from-invites', () => {
    test('creates one vanitylinks doc from the most-used vanity invite when a server has several, even if it is not the oldest', async () => {
        await seedInvite({
            code: 'oldest',
            customPath: 'myserver',
            uses: 3,
            createdAt: new Date(Date.now() - 10_000),
        });
        const mostUsed = await seedInvite({
            code: 'middle',
            customPath: 'myserver2',
            uses: 500,
            createdAt: new Date(Date.now() - 5_000),
        });
        await seedInvite({
            code: 'newest',
            customPath: 'myserver3',
            uses: 10,
            createdAt: new Date(),
        });

        await up();

        const db = mongoose.connection.db;
        if (!db) throw new Error('no db connection');
        const links = await db
            .collection('vanitylinks')
            .find({ serverId: 'server1' })
            .toArray();

        expect(links).toHaveLength(1);
        expect(links[0]?.code).toBe('myserver2');
        expect(mostUsed.code).toBe('middle');
    });

    test('breaks a tie between equally-used vanity invites by picking the oldest', async () => {
        const oldest = await seedInvite({
            code: 'oldest',
            customPath: 'myserver',
            uses: 0,
            createdAt: new Date(Date.now() - 10_000),
        });
        await seedInvite({
            code: 'newest',
            customPath: 'myserver2',
            uses: 0,
            createdAt: new Date(),
        });

        await up();

        const db = mongoose.connection.db;
        if (!db) throw new Error('no db connection');
        const links = await db
            .collection('vanitylinks')
            .find({ serverId: 'server1' })
            .toArray();

        expect(links).toHaveLength(1);
        expect(links[0]?.code).toBe('myserver');
        expect(oldest.code).toBe('oldest');
    });

    test('removes every vanity-shaped invite for the server, leaving plain invites untouched', async () => {
        await seedInvite({ code: 'v1', customPath: 'first' });
        await seedInvite({ code: 'v2', customPath: 'second' });
        await seedInvite({ code: 'plain1' });

        await up();

        const db = mongoose.connection.db;
        if (!db) throw new Error('no db connection');
        const remainingInvites = await db
            .collection('invites')
            .find({})
            .toArray();

        expect(remainingInvites).toHaveLength(1);
        expect(remainingInvites[0]?.code).toBe('plain1');
    });

    test('handles multiple servers independently', async () => {
        await seedInvite({
            serverId: 'server1',
            code: 'a1',
            customPath: 'aaa',
        });
        await seedInvite({
            serverId: 'server2',
            code: 'b1',
            customPath: 'bbb',
        });

        await up();

        const db = mongoose.connection.db;
        if (!db) throw new Error('no db connection');
        const links = await db.collection('vanitylinks').find({}).toArray();
        expect(links).toHaveLength(2);
        expect(links.map((l) => l.serverId).sort()).toEqual([
            'server1',
            'server2',
        ]);
    });

    test('servers with no vanity invites get no vanitylinks doc', async () => {
        await seedInvite({ code: 'plain-only' });

        await up();

        const db = mongoose.connection.db;
        if (!db) throw new Error('no db connection');
        expect(await db.collection('vanitylinks').countDocuments({})).toBe(0);
    });

    test('dry run makes no changes', async () => {
        await seedInvite({ code: 'v1', customPath: 'first' });

        await up({ dryRun: true });

        const db = mongoose.connection.db;
        if (!db) throw new Error('no db connection');
        expect(await db.collection('vanitylinks').countDocuments({})).toBe(0);
        expect(await db.collection('invites').countDocuments({})).toBe(1);
    });

    test('aborts with zero writes when a vanity customPath collides with an existing invite code', async () => {
        await seedInvite({ code: 'taken', customPath: 'myserver' });
        await seedInvite({ code: 'myserver' });

        await expect(up()).rejects.toThrow(/collision/i);

        const db = mongoose.connection.db;
        if (!db) throw new Error('no db connection');
        expect(await db.collection('vanitylinks').countDocuments({})).toBe(0);
        expect(await db.collection('invites').countDocuments({})).toBe(2);
    });

    test('down() recreates one invite per vanitylinks doc and clears vanitylinks', async () => {
        await seedInvite({ code: 'v1', customPath: 'first' });
        await up();

        await down();

        const db = mongoose.connection.db;
        if (!db) throw new Error('no db connection');
        expect(await db.collection('vanitylinks').countDocuments({})).toBe(0);
        const restored = await db.collection('invites').findOne({});
        expect(restored?.customPath).toBe('first');
        expect(restored?.code).toBe('first');
    });
});
