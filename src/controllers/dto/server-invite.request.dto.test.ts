import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInviteRequestDTO } from './server-invite.request.dto';

async function validateCustomPath(customPath: string) {
    const instance = plainToInstance(CreateInviteRequestDTO, { customPath });
    const errors = await validate(instance);
    return { instance, errors };
}

describe('CreateInviteRequestDTO', () => {
    describe('whitespace', () => {
        test('rejects a customPath made entirely of whitespace', async () => {
            const { errors } = await validateCustomPath(' ');
            expect(errors.length).toBeGreaterThan(0);
        });

        test('rejects a customPath made of only whitespace characters', async () => {
            const { errors } = await validateCustomPath('   ');
            expect(errors.length).toBeGreaterThan(0);
        });

        test('rejects a customPath containing internal whitespace', async () => {
            const { errors } = await validateCustomPath('my invite');
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
        ])('rejects customPath %p', async (customPath) => {
            const { errors } = await validateCustomPath(customPath);
            expect(errors.length).toBeGreaterThan(0);
        });
    });

    describe('unicode', () => {
        test.each(['café', 'naïve', 'invité', 'こんにちは', 'привет'])(
            'rejects customPath %p',
            async (customPath) => {
                const { errors } = await validateCustomPath(customPath);
                expect(errors.length).toBeGreaterThan(0);
            },
        );
    });

    describe('emojis', () => {
        test.each(['😀invite', 'invite🎉', '🔥🔥🔥', 'party🎈time'])(
            'rejects customPath %p',
            async (customPath) => {
                const { errors } = await validateCustomPath(customPath);
                expect(errors.length).toBeGreaterThan(0);
            },
        );
    });

    describe('length', () => {
        test('rejects an empty customPath', async () => {
            const { errors } = await validateCustomPath('');
            expect(errors.length).toBeGreaterThan(0);
        });

        test('rejects a single character customPath', async () => {
            const { errors } = await validateCustomPath('a');
            expect(errors.length).toBeGreaterThan(0);
        });

        test('rejects a customPath longer than 18 characters', async () => {
            const { errors } = await validateCustomPath('a'.repeat(19));
            expect(errors.length).toBeGreaterThan(0);
        });

        test('accepts a customPath exactly 2 characters long', async () => {
            const { errors } = await validateCustomPath('ab');
            expect(errors).toHaveLength(0);
        });

        test('accepts a customPath exactly 18 characters long', async () => {
            const { errors } = await validateCustomPath('a'.repeat(18));
            expect(errors).toHaveLength(0);
        });
    });

    describe('valid values', () => {
        test('accepts a normal alphanumeric customPath', async () => {
            const { errors } = await validateCustomPath('invite123');
            expect(errors).toHaveLength(0);
        });

        test('accepts uppercase letters', async () => {
            const { errors } = await validateCustomPath('MyCoolInvite');
            expect(errors).toHaveLength(0);
        });

        test('accepts an all-digit customPath', async () => {
            const { errors } = await validateCustomPath('123456');
            expect(errors).toHaveLength(0);
        });
    });
});
