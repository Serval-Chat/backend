import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
    MAX_GIF_KLIPY_ID_LENGTH,
    MAX_GIF_SLUG_LENGTH,
    MAX_GIF_URL_LENGTH,
} from '@/constants/favoriteGifs';
import { ToggleFavoriteGifRequestDTO } from '../klipy.request.dto';

const validBody = () => ({
    klipyId: 'abc123',
    slug: 'funny-cat',
    url: 'https://media.klipy.com/gifs/abc123.gif',
    previewUrl: 'https://media.klipy.com/gifs/abc123-preview.gif',
    width: 400,
    height: 300,
    contentType: 'gif' as const,
});

async function check(body: Record<string, unknown>) {
    const dto = plainToInstance(ToggleFavoriteGifRequestDTO, body);
    return validate(dto);
}

describe('ToggleFavoriteGifRequestDTO', () => {
    it('accepts a well-formed body', async () => {
        expect(await check(validBody())).toHaveLength(0);
    });

    it('rejects a url longer than the max length', async () => {
        const overlong =
            'https://media.klipy.com/' + 'a'.repeat(MAX_GIF_URL_LENGTH);
        const errors = await check({ ...validBody(), url: overlong });
        expect(errors.some((e) => e.property === 'url')).toBe(true);
    });

    it('accepts a url exactly at the max length', async () => {
        const prefix = 'https://media.klipy.com/';
        const padded = prefix + 'a'.repeat(MAX_GIF_URL_LENGTH - prefix.length);
        expect(padded).toHaveLength(MAX_GIF_URL_LENGTH);
        const errors = await check({ ...validBody(), url: padded });
        expect(errors.some((e) => e.property === 'url')).toBe(false);
    });

    it('rejects a previewUrl longer than the max length', async () => {
        const overlong =
            'https://media.klipy.com/' + 'a'.repeat(MAX_GIF_URL_LENGTH);
        const errors = await check({ ...validBody(), previewUrl: overlong });
        expect(errors.some((e) => e.property === 'previewUrl')).toBe(true);
    });

    it('rejects a klipyId longer than the max length', async () => {
        const overlong = 'x'.repeat(MAX_GIF_KLIPY_ID_LENGTH + 1);
        const errors = await check({ ...validBody(), klipyId: overlong });
        expect(errors.some((e) => e.property === 'klipyId')).toBe(true);
    });

    it('rejects a slug longer than the max length', async () => {
        const overlong = 'x'.repeat(MAX_GIF_SLUG_LENGTH + 1);
        const errors = await check({ ...validBody(), slug: overlong });
        expect(errors.some((e) => e.property === 'slug')).toBe(true);
    });

    it('rejects a non-URL string for url', async () => {
        const errors = await check({ ...validBody(), url: 'not-a-url' });
        expect(errors.some((e) => e.property === 'url')).toBe(true);
    });
});
