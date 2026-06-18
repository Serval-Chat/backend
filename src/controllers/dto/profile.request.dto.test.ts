import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateDisplayNameRequestDTO } from './profile.request.dto';

async function validateDisplayName(displayName: string) {
    const instance = plainToInstance(UpdateDisplayNameRequestDTO, {
        displayName,
    });
    const errors = await validate(instance);
    return { instance, errors };
}

describe('UpdateDisplayNameRequestDTO', () => {
    test('strips zero width characters before validation', async () => {
        const { instance, errors } = await validateDisplayName('John​Doe');
        expect(errors).toHaveLength(0);
        expect(instance.displayName).toBe('JohnDoe');
    });

    test('rejects a display name made entirely of invisible characters', async () => {
        const { errors } = await validateDisplayName('​‌‍﻿');
        expect(errors.length).toBeGreaterThan(0);
    });

    test('does not let invisible characters pad the length past the max', async () => {
        const padded = 'a'.repeat(32) + '​'.repeat(50);
        const { instance, errors } = await validateDisplayName(padded);
        expect(errors).toHaveLength(0);
        expect(instance.displayName).toBe('a'.repeat(32));
    });
});
