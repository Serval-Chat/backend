import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ApiError } from '@/utils/ApiError';
import { wsErrorCodeForStatus } from '@/ws/protocol/error';

const CONTROLLER_DIR = join(__dirname, '..');

const PREFIXES = [
    'BAD_REQUEST',
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
    'INTERNAL_ERROR',
    'AUTHENTICATION_FAILED',
    'VALIDATION_FAILED',
    'RATE_LIMIT',
];

function controllerSources(): { file: string; source: string }[] {
    return readdirSync(CONTROLLER_DIR)
        .filter((f) => f.endsWith('Controller.ts'))
        .map((file) => ({
            file,
            source: readFileSync(join(CONTROLLER_DIR, file), 'utf8'),
        }));
}

describe('the WebSocket controllers use ApiError, not message prefixes', () => {
    const sources = controllerSources();

    it('reads every controller', () => {
        expect(sources.length).toBeGreaterThanOrEqual(6);
    });

    it.each(sources.map((s) => [s.file, s.source] as const))(
        '%s throws no bare Error',
        (_file, source) => {
            expect(source).not.toMatch(/new Error\(/);
        },
    );

    it.each(sources.map((s) => [s.file, s.source] as const))(
        '%s carries no protocol prefix in a message',
        (_file, source) => {
            for (const prefix of PREFIXES) {
                expect(source).not.toContain(`${prefix}: `);
            }
        },
    );

    it('throws at least fifty ApiErrors across the layer', () => {
        const total = sources.reduce(
            (n, s) => n + (s.source.match(/new ApiError\(/g) ?? []).length,
            0,
        );
        expect(total).toBeGreaterThanOrEqual(50);
    });

    it('uses only statuses the dispatcher can map', () => {
        const mappable = new Set([400, 401, 403, 404, 409, 429, 500]);
        for (const { file, source } of sources) {
            for (const m of source.matchAll(/new ApiError\(\s*(\d+)/g)) {
                expect({ file, status: Number(m[1]) }).toEqual({
                    file,
                    status: expect.any(Number),
                });
                expect(mappable.has(Number(m[1]))).toBe(true);
            }
        }
    });
});

describe('the dispatcher maps ApiError status to a protocol code', () => {
    it.each([
        [400, 'BAD_REQUEST'],
        [401, 'UNAUTHORIZED'],
        [403, 'FORBIDDEN'],
        [404, 'NOT_FOUND'],
        [409, 'CONFLICT'],
        [429, 'RATE_LIMIT'],
        [500, 'INTERNAL_ERROR'],
        [418, 'INTERNAL_ERROR'],
    ] as const)('%i becomes %s', (status, code) => {
        expect(wsErrorCodeForStatus(status)).toBe(code);
    });

    it('is the function the dispatcher actually calls', () => {
        const source = readFileSync(
            join(__dirname, '..', '..', 'dispatcher.ts'),
            'utf8',
        );
        expect(source).toContain('wsErrorCodeForStatus(err.status)');
        expect(source).not.toMatch(/err\.status === 40[0-9]/);
    });

    it('reaches the client through a real ApiError throw', () => {
        const err = new ApiError(403, 'Not a member of this server');
        expect(wsErrorCodeForStatus(err.status)).toBe('FORBIDDEN');
        expect(err.message).toBe('Not a member of this server');
    });
});
