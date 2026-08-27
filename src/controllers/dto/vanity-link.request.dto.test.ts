import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetVanityLinkRequestDTO } from './vanity-link.request.dto';

async function validateCode(code: string) {
    const instance = plainToInstance(SetVanityLinkRequestDTO, { code });
    const errors = await validate(instance);
    return { instance, errors };
}

describe('SetVanityLinkRequestDTO', () => {
    describe('whitespace', () => {
        test('rejects a code made entirely of whitespace', async () => {
            const { errors } = await validateCode(' ');
            expect(errors.length).toBeGreaterThan(0);
        });

        test('rejects a code made of only whitespace characters', async () => {
            const { errors } = await validateCode('   ');
            expect(errors.length).toBeGreaterThan(0);
        });

        test('rejects a code containing internal whitespace', async () => {
            const { errors } = await validateCode('my invite');
            expect(errors.length).toBeGreaterThan(0);
        });
    });

    describe('special characters', () => {
        test.each([
            'foo-bar',
            'foo_bar',
            'foo.bar',
            'foo/bar',
            'foo!',
            "foo'bar",
        ])('rejects code %p', async (code) => {
            const { errors } = await validateCode(code);
            expect(errors.length).toBeGreaterThan(0);
        });
    });

    describe('unicode', () => {
        test.each(['café', 'naïve', 'invité', 'こんにちは', 'привет'])(
            'rejects code %p',
            async (code) => {
                const { errors } = await validateCode(code);
                expect(errors.length).toBeGreaterThan(0);
            },
        );
    });

    describe('emojis', () => {
        test.each(['😀invite', 'invite🎉', '🔥🔥🔥', 'party🎈time'])(
            'rejects code %p',
            async (code) => {
                const { errors } = await validateCode(code);
                expect(errors.length).toBeGreaterThan(0);
            },
        );
    });

    describe('length', () => {
        test('rejects an empty code', async () => {
            const { errors } = await validateCode('');
            expect(errors.length).toBeGreaterThan(0);
        });

        test('rejects a single character code', async () => {
            const { errors } = await validateCode('a');
            expect(errors.length).toBeGreaterThan(0);
        });

        test('rejects a code longer than 18 characters', async () => {
            const { errors } = await validateCode('a'.repeat(19));
            expect(errors.length).toBeGreaterThan(0);
        });

        test('accepts a code exactly 2 characters long', async () => {
            const { errors } = await validateCode('ab');
            expect(errors).toHaveLength(0);
        });

        test('accepts a code exactly 18 characters long', async () => {
            const { errors } = await validateCode('a'.repeat(18));
            expect(errors).toHaveLength(0);
        });
    });

    describe('valid values', () => {
        test('accepts a normal alphanumeric code', async () => {
            const { errors } = await validateCode('invite123');
            expect(errors).toHaveLength(0);
        });

        test('accepts uppercase letters', async () => {
            const { errors } = await validateCode('MyCoolInvite');
            expect(errors).toHaveLength(0);
        });

        test('accepts an all-digit code', async () => {
            const { errors } = await validateCode('123456');
            expect(errors).toHaveLength(0);
        });
    });
});
