import { extractCustomEmojiIds } from '@/utils/emojiParser';

const ID_A = '1234567890123456789';
const ID_B = '9876543210987654321';

describe('extractCustomEmojiIds', () => {
    test('returns empty array for text with no emoji tokens', () => {
        expect(extractCustomEmojiIds('hello world')).toEqual([]);
    });

    test('extracts a single emoji id', () => {
        expect(extractCustomEmojiIds(`hi <emoji:${ID_A}> there`)).toEqual([
            ID_A,
        ]);
    });

    test('extracts multiple distinct emoji ids in order of first appearance', () => {
        expect(
            extractCustomEmojiIds(`<emoji:${ID_A}> and <emoji:${ID_B}>`),
        ).toEqual([ID_A, ID_B]);
    });

    test('deduplicates repeated tokens', () => {
        expect(extractCustomEmojiIds(`<emoji:${ID_A}><emoji:${ID_A}>`)).toEqual(
            [ID_A],
        );
    });

    test('ignores malformed tokens (not 19-digit snowflakes)', () => {
        expect(extractCustomEmojiIds('<emoji:not-a-snowflake>')).toEqual([]);
        expect(extractCustomEmojiIds('<emoji:123>')).toEqual([]);
        expect(extractCustomEmojiIds('<emoji:>')).toEqual([]);
    });

    test('caps the number of extracted ids', () => {
        const ids = Array.from({ length: 60 }, (_, i) =>
            String(i).padStart(19, '0'),
        );
        const text = ids.map((id) => `<emoji:${id}>`).join(' ');
        expect(extractCustomEmojiIds(text).length).toBe(50);
    });
});
