/**
 * env.ts validates at import time and skips it when NODE_ENV is 'test', so the
 * check is exercised by re-importing the module with the guard lifted.
 */
function loadEnv(overrides: Record<string, string>): void {
    jest.resetModules();
    const previous = { ...process.env };
    Object.assign(process.env, { NODE_ENV: 'development' }, overrides);
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
