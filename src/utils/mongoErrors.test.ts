import { isDuplicateKeyError } from '@/utils/mongoErrors';

describe('isDuplicateKeyError', () => {
    it('recognises Mongo error code 11000', () => {
        expect(isDuplicateKeyError({ code: 11000 })).toBe(true);
        expect(
            isDuplicateKeyError(
                Object.assign(new Error('dup'), { code: 11000 }),
            ),
        ).toBe(true);
    });

    it('rejects anything else', () => {
        for (const value of [
            null,
            undefined,
            11000,
            '11000',
            { code: '11000' },
            { code: 11001 },
            new Error('E11000'),
        ]) {
            expect(isDuplicateKeyError(value)).toBe(false);
        }
    });
});
