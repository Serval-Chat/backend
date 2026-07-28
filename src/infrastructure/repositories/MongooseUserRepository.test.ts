import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { User } from '@/models/User';
import { mapUser } from '@/utils/user';
import { MAX_FREQUENTLY_USED_EMOJIS } from '@/constants/frequentlyUsedEmoji';
import type { FrequentlyUsedEmojiEntry } from '@/di/interfaces/IUserRepository';

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

describe('MongooseUserRepository.findByIds', () => {
    test('returns users whose mapped id matches their snowflakeId', async () => {
        const user = await createUser();

        const [found] = await repo.findByIds([user.snowflakeId]);
        if (!found) throw new Error('expected findByIds to return a user');

        expect(found.snowflakeId).toBe(user.snowflakeId);
        expect(mapUser(found)?.id).toBe(user.snowflakeId);
    });

    test('only returns users matching the requested snowflake ids', async () => {
        const user = await createUser();
        const other = await createUser();

        const found = await repo.findByIds([user.snowflakeId]);

        expect(found.map((u) => u.snowflakeId)).toEqual([user.snowflakeId]);
        expect(found.map((u) => u.snowflakeId)).not.toContain(
            other.snowflakeId,
        );
    });
});

describe('MongooseUserRepository.updateFrequentlyUsedEmojis', () => {
    const makeEntry = (
        overrides: Partial<FrequentlyUsedEmojiEntry> = {},
    ): FrequentlyUsedEmojiEntry => ({
        emoji: '😀',
        emojiType: 'unicode',
        count: 1,
        lastUsedAt: new Date('2026-07-27T12:00:00.000Z'),
        ...overrides,
    });

    test('persists the given list on the user', async () => {
        const user = await createUser();
        const emojis = [makeEntry({ emoji: '👍', count: 3 })];

        await repo.updateFrequentlyUsedEmojis(user.snowflakeId, emojis);

        const found = await repo.findById(user.snowflakeId);
        expect(found?.frequentlyUsedEmojis).toEqual([
            expect.objectContaining({ emoji: '👍', count: 3 }),
        ]);
    });

    test('fully replaces the previous list rather than merging with it', async () => {
        const user = await createUser();
        await repo.updateFrequentlyUsedEmojis(user.snowflakeId, [
            makeEntry({ emoji: '👍' }),
            makeEntry({ emoji: '🔥' }),
        ]);

        await repo.updateFrequentlyUsedEmojis(user.snowflakeId, [
            makeEntry({ emoji: '🎉' }),
        ]);

        const found = await repo.findById(user.snowflakeId);
        expect(found?.frequentlyUsedEmojis).toHaveLength(1);
        expect(found?.frequentlyUsedEmojis?.[0]).toEqual(
            expect.objectContaining({ emoji: '🎉' }),
        );
    });

    test('rejects more than the max allowed entries, even bypassing the request DTO', async () => {
        const user = await createUser();
        const tooMany = Array.from(
            { length: MAX_FREQUENTLY_USED_EMOJIS + 1 },
            () => makeEntry(),
        );

        await expect(
            repo.updateFrequentlyUsedEmojis(user.snowflakeId, tooMany),
        ).rejects.toThrow();

        const found = await repo.findById(user.snowflakeId);
        expect(found?.frequentlyUsedEmojis ?? []).toHaveLength(0);
    });

    test('rejects an entry with a count below the schema minimum, even bypassing the request DTO', async () => {
        const user = await createUser();

        await expect(
            repo.updateFrequentlyUsedEmojis(user.snowflakeId, [
                makeEntry({ count: 0 }),
            ]),
        ).rejects.toThrow();
    });

    test('rejects an entry missing a required field, even bypassing the request DTO', async () => {
        const user = await createUser();
        const malformed: FrequentlyUsedEmojiEntry[] = [
            {
                emoji: '😀',
                count: 1,
                lastUsedAt: new Date(),
            } as FrequentlyUsedEmojiEntry,
        ];

        await expect(
            repo.updateFrequentlyUsedEmojis(user.snowflakeId, malformed),
        ).rejects.toThrow();
    });
});
