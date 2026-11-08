import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { UserConnection } from '@/models/UserConnection';

import { MongooseUserConnectionRepository } from './MongooseUserConnectionRepository';

let mongod: MongoMemoryServer;
const repo = new MongooseUserConnectionRepository();

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    await UserConnection.syncIndexes();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

afterEach(async () => {
    await UserConnection.deleteMany({});
});

const start = (userId: string, site: string) =>
    repo.startWebsiteVerification({
        userId,
        value: site,
        normalizedValue: site,
        verificationTokenHash: `hash-${site}`,
        verificationRecordName: `_serchat.${site}`,
        expiresAt: new Date(Date.now() + 60_000),
    });

describe('MongooseUserConnectionRepository', () => {
    it('starts a pending verification with a snowflake id, and restarts it in place', async () => {
        const first = await start('u1', 'example.com');
        expect(first.snowflakeId).toMatch(/^\d+$/);
        expect(first.status).toBe('pending');

        const again = await start('u1', 'example.com');
        expect(again.snowflakeId).toBe(first.snowflakeId);
        expect(await UserConnection.countDocuments({ userId: 'u1' })).toBe(1);
    });

    it('marks a connection verified and clears its verification fields', async () => {
        const pending = await start('u1', 'example.com');

        const verified = await repo.markVerified(pending.snowflakeId, 'u1');

        expect(verified?.status).toBe('verified');
        expect(verified?.verifiedAt).toBeInstanceOf(Date);
        expect(verified?.verificationTokenHash).toBeUndefined();
        expect(verified?.expiresAt).toBeUndefined();
        expect(await repo.markVerified(pending.snowflakeId, 'u2')).toBeNull();
    });

    it('rejects verifying a website another user already verified', async () => {
        const mine = await start('u1', 'example.com');
        await repo.markVerified(mine.snowflakeId, 'u1');
        const theirs = await start('u2', 'example.com');

        await expect(
            repo.markVerified(theirs.snowflakeId, 'u2'),
        ).rejects.toMatchObject({ code: 11000 });
    });

    it('reports who has a website verified', async () => {
        const conn = await start('u1', 'example.com');
        expect(await repo.isWebsiteVerifiedByUser('u1', 'example.com')).toBe(
            false,
        );

        await repo.markVerified(conn.snowflakeId, 'u1');

        expect(await repo.isWebsiteVerifiedByUser('u1', 'example.com')).toBe(
            true,
        );
        expect(
            await repo.isWebsiteVerifiedByOtherUser('example.com', 'u2'),
        ).toBe(true);
        expect(
            await repo.isWebsiteVerifiedByOtherUser('example.com', 'u1'),
        ).toBe(false);
    });

    it('lists verified connections only, oldest verification first', async () => {
        const a = await start('u1', 'a.example');
        await start('u1', 'pending.example');
        const b = await start('u1', 'b.example');
        await repo.markVerified(b.snowflakeId, 'u1');
        await new Promise((resolve) => setTimeout(resolve, 5));
        await repo.markVerified(a.snowflakeId, 'u1');

        const verified = await repo.findVerifiedByUser('u1');

        expect(verified.map((c) => c.value)).toEqual([
            'b.example',
            'a.example',
        ]);
    });

    it("lists all of a user's connections, pending before verified", async () => {
        const verified = await start('u1', 'verified.example');
        await repo.markVerified(verified.snowflakeId, 'u1');
        await start('u1', 'pending.example');
        await start('u2', 'theirs.example');

        const all = await repo.findAllByUser('u1');

        expect(all.map((c) => [c.value, c.status])).toEqual([
            ['pending.example', 'pending'],
            ['verified.example', 'verified'],
        ]);
    });

    it("finds and deletes only the owner's connection", async () => {
        const conn = await start('u1', 'example.com');

        expect(
            await repo.findWebsiteForUser(conn.snowflakeId, 'u2'),
        ).toBeNull();
        expect(await repo.deleteForUser(conn.snowflakeId, 'u2')).toBe(false);
        expect(await repo.deleteForUser(conn.snowflakeId, 'u1')).toBe(true);
        expect(
            await repo.findWebsiteForUser(conn.snowflakeId, 'u1'),
        ).toBeNull();
    });
});
