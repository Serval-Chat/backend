/**
 * env.ts validates at import time and skips it when NODE_ENV is 'test', so the
 * check is exercised by re-importing the module with the guard lifted.
 */
function loadEnv(
    overrides: Record<string, string>,
    nodeEnv = 'development',
): void {
    jest.resetModules();
    const previous = { ...process.env };
    Object.assign(process.env, { NODE_ENV: nodeEnv }, overrides);
    try {
        require('@/config/env');
    } finally {
        process.env = previous;
    }
}

const VALID = {
    JWT_SECRET: 'j'.repeat(32),
    APP_ENCRYPTION_KEY: 'k'.repeat(32),
};

describe('secret length validation', () => {
    it.each([
        ['JWT_SECRET', { ...VALID, JWT_SECRET: 'a' }],
        [
            'JWT_SECRET just under the floor',
            { ...VALID, JWT_SECRET: 'a'.repeat(31) },
        ],
        ['APP_ENCRYPTION_KEY', { ...VALID, APP_ENCRYPTION_KEY: 'b' }],
    ])('refuses to start with a short %s', (_label, overrides) => {
        expect(() => loadEnv(overrides)).toThrow(/at least 32 characters/);
    });

    it('names the offending variable and its actual length', () => {
        expect(() => loadEnv({ ...VALID, JWT_SECRET: 'a'.repeat(8) })).toThrow(
            /JWT_SECRET must be at least 32 characters \(got 8\)/,
        );
    });

    it('accepts secrets at the floor', () => {
        expect(() => loadEnv(VALID)).not.toThrow(/at least 32 characters/);
    });
});

describe('secret validation cannot be bypassed with NODE_ENV=test', () => {
    it.each([
        [
            'an empty JWT_SECRET',
            { ...VALID, JWT_SECRET: '' },
            /JWT_SECRET not set/,
        ],
        [
            'an empty APP_ENCRYPTION_KEY',
            { ...VALID, APP_ENCRYPTION_KEY: '' },
            /APP_ENCRYPTION_KEY not set/,
        ],
        [
            'a JWT_SECRET under the floor',
            { ...VALID, JWT_SECRET: 'a'.repeat(10) },
            /at least 32 characters/,
        ],
        [
            'identical secrets',
            { JWT_SECRET: 'x'.repeat(32), APP_ENCRYPTION_KEY: 'x'.repeat(32) },
            /cannot be the same/,
        ],
    ])(
        'still refuses %s under NODE_ENV=test',
        (_label, overrides, expected) => {
            expect(() => loadEnv(overrides, 'test')).toThrow(expected);
        },
    );

    it('still accepts valid secrets under NODE_ENV=test', () => {
        expect(() => loadEnv(VALID, 'test')).not.toThrow();
    });
});

describe('NODE_ENV=test is refused when PROJ_LEVEL=release', () => {
    it('refuses to start in that combination', () => {
        expect(() =>
            loadEnv({ ...VALID, PROJ_LEVEL: 'release' }, 'test'),
        ).toThrow(/NODE_ENV=test with PROJ_LEVEL=release/);
    });

    it('starts normally under NODE_ENV=test with PROJ_LEVEL=development', () => {
        expect(() =>
            loadEnv({ ...VALID, PROJ_LEVEL: 'development' }, 'test'),
        ).not.toThrow();
    });

    it('starts normally in a real release boot (NODE_ENV unset)', () => {
        expect(() =>
            loadEnv({ ...VALID, PROJ_LEVEL: 'release' }, 'production'),
        ).not.toThrow();
    });
});
