import 'reflect-metadata';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { MongooseWarningRepository } from '../../src/infrastructure/repositories/MongooseWarningRepository';

describe('MongooseWarningRepository expiresAt', () => {
    let mongod: MongoMemoryServer;
    let repo: MongooseWarningRepository;

    beforeAll(async () => {
        mongod = await MongoMemoryServer.create();
        await mongoose.connect(mongod.getUri());
        repo = new MongooseWarningRepository();
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongod.stop();
    });

    it('does not set expiresAt at creation time, even with a duration', async () => {
        const warning = await repo.create({
            userId: 'user-1',
            issuedBy: 'admin-1',
            message: 'be nice',
            expiryDurationMinutes: 60,
        });

        expect(warning.expiryDurationMinutes).toBe(60);
        expect(warning.expiresAt).toBeUndefined();
    });

    it('keeps blocking an unacknowledged warning indefinitely, regardless of its configured duration', async () => {
        await repo.create({
            userId: 'user-ignored',
            issuedBy: 'admin-1',
            message: 'ignored warning',
            expiryDurationMinutes: 1,
        });

        // No amount of real time passing matters here: the duration only
        // starts counting once acknowledged, so this must still block.
        expect(await repo.hasUnacknowledged('user-ignored')).toBe(true);
    });

    it('computes expiresAt from the configured duration at the moment of acknowledgment', async () => {
        const created = await repo.create({
            userId: 'user-ack',
            issuedBy: 'admin-1',
            message: 'will expire after ack',
            expiryDurationMinutes: 60,
        });

        const before = Date.now();
        const acknowledged = await repo.acknowledge(created.snowflakeId);
        expect(acknowledged).not.toBeNull();
        expect(acknowledged?.acknowledged).toBe(true);
        expect(acknowledged?.acknowledgedAt).toBeDefined();

        const expectedExpiry =
            (acknowledged?.acknowledgedAt?.getTime() ?? before) + 60 * 60_000;
        expect(acknowledged?.expiresAt?.getTime()).toBe(expectedExpiry);

        // No longer blocking once acknowledged, independent of expiresAt.
        expect(await repo.hasUnacknowledged('user-ack')).toBe(false);
    });

    it('leaves expiresAt unset on acknowledgment when no duration was configured', async () => {
        const created = await repo.create({
            userId: 'user-permanent-ack',
            issuedBy: 'admin-1',
            message: 'permanent warning',
        });

        const acknowledged = await repo.acknowledge(created.snowflakeId);
        expect(acknowledged?.acknowledged).toBe(true);
        expect(acknowledged?.expiresAt).toBeUndefined();
    });
});
