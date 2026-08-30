import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { User } from '@/models/User';

import { MongooseUserRepository } from './MongooseUserRepository';

let mongod: MongoMemoryServer;
let repo: MongooseUserRepository;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    repo = new MongooseUserRepository();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

const createUser = (overrides: Record<string, unknown> = {}) =>
    User.create({
        username: `user_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        login: `login_${Date.now()}_${Math.floor(Math.random() * 100000)}@example.com`,
        password: 'password123',
        ...overrides,
    });

const withRecoveryKeys = (userId: string) =>
    User.findOne({ snowflakeId: userId }).select('+recoveryKeys').lean();

describe('MongooseUserRepository passwordless support', () => {
    it('enablePasswordless unsets the password and sets the flag + recovery keys', async () => {
        const user = await createUser();

        await repo.enablePasswordless(user.snowflakeId, ['hash-1', 'hash-2']);

        const found = await withRecoveryKeys(user.snowflakeId);
        expect(found?.passwordless).toBe(true);
        expect(found?.recoveryKeys).toEqual(['hash-1', 'hash-2']);
        expect(
            await repo.comparePassword(user.snowflakeId, 'password123'),
        ).toBe(false);
    });

    it('disablePasswordless restores a hashed, comparable password and clears passwordless state', async () => {
        const user = await createUser();
        await repo.enablePasswordless(user.snowflakeId, ['hash-1']);

        await repo.disablePasswordless(user.snowflakeId, 'brand-new-temp-pw');

        expect(
            await repo.comparePassword(user.snowflakeId, 'brand-new-temp-pw'),
        ).toBe(true);
        expect(
            await repo.comparePassword(user.snowflakeId, 'wrong-password'),
        ).toBe(false);

        const found = await withRecoveryKeys(user.snowflakeId);
        expect(found?.passwordless).toBe(false);
        expect(found?.recoveryKeys).toEqual([]);
    });

    describe('consumeRecoveryKey', () => {
        it('removes the matching hash and returns true', async () => {
            const user = await createUser();
            await repo.enablePasswordless(user.snowflakeId, [
                'hash-1',
                'hash-2',
            ]);

            const consumed = await repo.consumeRecoveryKey(
                user.snowflakeId,
                'hash-1',
            );

            expect(consumed).toBe(true);
            const found = await withRecoveryKeys(user.snowflakeId);
            expect(found?.recoveryKeys).toEqual(['hash-2']);
        });

        it('returns false for a hash that was never present, leaving the array untouched', async () => {
            const user = await createUser();
            await repo.enablePasswordless(user.snowflakeId, ['hash-1']);

            const consumed = await repo.consumeRecoveryKey(
                user.snowflakeId,
                'never-issued',
            );

            expect(consumed).toBe(false);
            const found = await withRecoveryKeys(user.snowflakeId);
            expect(found?.recoveryKeys).toEqual(['hash-1']);
        });

        it('only lets one of two concurrent calls consume the same key', async () => {
            const user = await createUser();
            await repo.enablePasswordless(user.snowflakeId, ['shared-hash']);

            const [first, second] = await Promise.all([
                repo.consumeRecoveryKey(user.snowflakeId, 'shared-hash'),
                repo.consumeRecoveryKey(user.snowflakeId, 'shared-hash'),
            ]);

            expect([first, second].filter(Boolean)).toHaveLength(1);
            const found = await withRecoveryKeys(user.snowflakeId);
            expect(found?.recoveryKeys).toEqual([]);
        });

        it('returns false once a key has already been consumed', async () => {
            const user = await createUser();
            await repo.enablePasswordless(user.snowflakeId, ['hash-1']);

            expect(
                await repo.consumeRecoveryKey(user.snowflakeId, 'hash-1'),
            ).toBe(true);
            expect(
                await repo.consumeRecoveryKey(user.snowflakeId, 'hash-1'),
            ).toBe(false);
        });
    });
});
