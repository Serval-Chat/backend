import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
    FrequentlyUsedEmojiTypeDTO,
    UpdateFrequentlyUsedEmojisRequestDTO,
} from './frequently-used-emoji.dto';
import { MAX_FREQUENTLY_USED_EMOJIS } from '@/constants/frequentlyUsedEmoji';

const validEntry = {
    emoji: '😀',
    emojiType: FrequentlyUsedEmojiTypeDTO.UNICODE,
    count: 1,
    lastUsedAt: '2026-07-27T12:00:00.000Z',
};

async function validateBody(body: unknown) {
    const instance = plainToInstance(
        UpdateFrequentlyUsedEmojisRequestDTO,
        body,
    );
    const errors = await validate(instance, {
        whitelist: true,
        forbidNonWhitelisted: true,
    });
    return errors;
}

describe('UpdateFrequentlyUsedEmojisRequestDTO', () => {
    test('accepts a valid unicode entry', async () => {
        const errors = await validateBody({ emojis: [validEntry] });
        expect(errors).toHaveLength(0);
    });

    test('accepts a valid custom entry', async () => {
        const errors = await validateBody({
            emojis: [
                {
                    emoji: 'party_blob',
                    emojiType: FrequentlyUsedEmojiTypeDTO.CUSTOM,
                    emojiId: '1234567890123456789',
                    count: 5,
                    lastUsedAt: '2026-07-27T12:00:00.000Z',
                },
            ],
        });
        expect(errors).toHaveLength(0);
    });

    test('rejects a unicode entry whose emoji is not a real emoji', async () => {
        const errors = await validateBody({
            emojis: [{ ...validEntry, emoji: 'not-an-emoji' }],
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    test('rejects a custom entry missing emojiId', async () => {
        const errors = await validateBody({
            emojis: [
                {
                    emoji: 'party_blob',
                    emojiType: FrequentlyUsedEmojiTypeDTO.CUSTOM,
                    count: 1,
                    lastUsedAt: '2026-07-27T12:00:00.000Z',
                },
            ],
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    test('rejects a custom entry with a malformed emojiId', async () => {
        const errors = await validateBody({
            emojis: [
                {
                    emoji: 'party_blob',
                    emojiType: FrequentlyUsedEmojiTypeDTO.CUSTOM,
                    emojiId: 'not-a-snowflake',
                    count: 1,
                    lastUsedAt: '2026-07-27T12:00:00.000Z',
                },
            ],
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    test('rejects a unicode entry that carries an emojiId', async () => {
        const errors = await validateBody({
            emojis: [{ ...validEntry, emojiId: '1234567890123456789' }],
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    test('rejects a count of zero', async () => {
        const errors = await validateBody({
            emojis: [{ ...validEntry, count: 0 }],
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    test('rejects a negative count', async () => {
        const errors = await validateBody({
            emojis: [{ ...validEntry, count: -1 }],
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    test('rejects a non-integer count', async () => {
        const errors = await validateBody({
            emojis: [{ ...validEntry, count: 1.5 }],
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    test('rejects a count above the allowed maximum', async () => {
        const errors = await validateBody({
            emojis: [{ ...validEntry, count: 1_000_001 }],
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    test('rejects an empty emoji value', async () => {
        const errors = await validateBody({
            emojis: [
                {
                    emoji: '',
                    emojiType: FrequentlyUsedEmojiTypeDTO.CUSTOM,
                    emojiId: '1234567890123456789',
                    count: 1,
                    lastUsedAt: '2026-07-27T12:00:00.000Z',
                },
            ],
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    test('rejects an emoji value longer than 100 characters', async () => {
        const errors = await validateBody({
            emojis: [
                {
                    emoji: 'a'.repeat(101),
                    emojiType: FrequentlyUsedEmojiTypeDTO.CUSTOM,
                    emojiId: '1234567890123456789',
                    count: 1,
                    lastUsedAt: '2026-07-27T12:00:00.000Z',
                },
            ],
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    test('rejects a non-ISO lastUsedAt', async () => {
        const errors = await validateBody({
            emojis: [{ ...validEntry, lastUsedAt: 'not-a-date' }],
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    test('rejects unknown properties on an entry (strict shape)', async () => {
        const errors = await validateBody({
            emojis: [{ ...validEntry, extraField: 'nope' }],
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    test(`rejects more than ${MAX_FREQUENTLY_USED_EMOJIS} entries`, async () => {
        const emojis = Array.from(
            { length: MAX_FREQUENTLY_USED_EMOJIS + 1 },
            () => ({
                ...validEntry,
            }),
        );
        const errors = await validateBody({ emojis });
        expect(errors.length).toBeGreaterThan(0);
    });

    test(`accepts exactly ${MAX_FREQUENTLY_USED_EMOJIS} entries`, async () => {
        const emojis = Array.from(
            { length: MAX_FREQUENTLY_USED_EMOJIS },
            () => ({
                ...validEntry,
            }),
        );
        const errors = await validateBody({ emojis });
        expect(errors).toHaveLength(0);
    });

    test('does not check whether a custom emojiId actually exists', async () => {
        const errors = await validateBody({
            emojis: [
                {
                    emoji: 'definitely_does_not_exist',
                    emojiType: FrequentlyUsedEmojiTypeDTO.CUSTOM,
                    emojiId: '9999999999999999999',
                    count: 1,
                    lastUsedAt: '2026-07-27T12:00:00.000Z',
                },
            ],
        });
        expect(errors).toHaveLength(0);
    });
});
