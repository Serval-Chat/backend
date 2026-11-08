import { escapeRegex, normalizeRegexSearch } from '@/utils/regex';

describe('escapeRegex', () => {
    it('matches regex metacharacters literally', () => {
        const input = 'a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o';
        expect(new RegExp(`^${escapeRegex(input)}$`).test(input)).toBe(true);
        expect(new RegExp(escapeRegex('a.b')).test('axb')).toBe(false);
    });
});

describe('normalizeRegexSearch', () => {
    it('trims, caps at 64 characters, then escapes', () => {
        expect(normalizeRegexSearch('  (cat)  ')).toBe('\\(cat\\)');
        expect(normalizeRegexSearch('x'.repeat(100))).toHaveLength(64);
    });
});
