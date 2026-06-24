import {
    encodeSnowflakeId,
    generateSnowflakeId,
    isValidSnowflakeId,
    snowflakeIdToDate,
} from './snowflake';

describe('snowflake utility', () => {
    test('generates a 19-digit zero-padded decimal string', () => {
        const id = generateSnowflakeId();
        expect(id).toMatch(/^\d{19}$/);
        expect(isValidSnowflakeId(id)).toBe(true);
    });

    test('generates unique, monotonically increasing IDs', () => {
        const ids = Array.from({ length: 5000 }, () => generateSnowflakeId());
        expect(new Set(ids).size).toBe(ids.length);

        // ids are zero-padded fixed-width decimal strings, so string sort
        // order matches generation order.
        const sorted = [...ids].sort();
        expect(ids).toEqual(sorted);
    });

    test('string sort order matches numeric order across many IDs', () => {
        const ids = Array.from({ length: 200 }, () => generateSnowflakeId());
        const sortedAsStrings = [...ids].sort();
        const sortedAsBigInts = [...ids]
            .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1))
            .map(String);
        expect(sortedAsStrings).toEqual(sortedAsBigInts);
    });

    test('snowflakeIdToDate round-trips close to generation time', () => {
        const before = Date.now();
        const id = generateSnowflakeId();
        const after = Date.now();

        const decoded = snowflakeIdToDate(id).getTime();
        expect(decoded).toBeGreaterThanOrEqual(before - 1);
        expect(decoded).toBeLessThanOrEqual(after + 1);
    });

    test('isValidSnowflakeId rejects ObjectId-shaped and malformed values', () => {
        expect(isValidSnowflakeId('507f1f77bcf86cd799439011')).toBe(false);
        expect(isValidSnowflakeId('not-an-id')).toBe(false);
        expect(isValidSnowflakeId('123')).toBe(false);
        expect(isValidSnowflakeId(undefined)).toBe(false);
        expect(isValidSnowflakeId(null)).toBe(false);
    });

    test('throws if the clock appears to move backwards', () => {
        const realNow = Date.now;
        try {
            generateSnowflakeId();
            Date.now = () => realNow() - 60_000;
            expect(() => generateSnowflakeId()).toThrow(
                /Clock moved backwards/,
            );
        } finally {
            Date.now = realNow;
        }
    });
});

describe('encodeSnowflakeId', () => {
    test('round-trips a given timestamp through snowflakeIdToDate', () => {
        const createdAt = new Date('2024-06-01T12:00:00.000Z').getTime();
        const id = encodeSnowflakeId(createdAt, 0, 0);
        expect(isValidSnowflakeId(id)).toBe(true);
        expect(snowflakeIdToDate(id).getTime()).toBe(createdAt);
    });

    test('clamps timestamps before EPOCH_MS to the start of the ID space', () => {
        const beforeEpoch = new Date('2020-01-01T00:00:00.000Z').getTime();
        const id = encodeSnowflakeId(beforeEpoch, 0, 0);
        expect(snowflakeIdToDate(id).getTime()).toBe(
            new Date('2024-01-01T00:00:00.000Z').getTime(),
        );
    });

    test('different sequence values at the same timestamp produce distinct, ordered ids', () => {
        const ts = Date.now();
        const a = encodeSnowflakeId(ts, 0, 0);
        const b = encodeSnowflakeId(ts, 0, 1);
        expect(a).not.toBe(b);
        expect(b > a).toBe(true);
    });
});

describe('snowflake worker id validation', () => {
    const originalEnv = process.env.SNOWFLAKE_WORKER_ID;

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.SNOWFLAKE_WORKER_ID;
        } else {
            process.env.SNOWFLAKE_WORKER_ID = originalEnv;
        }
        jest.resetModules();
    });

    test('rejects an out-of-range worker id at import time', () => {
        jest.resetModules();
        process.env.SNOWFLAKE_WORKER_ID = '1024';
        expect(() => require('./snowflake')).toThrow(
            /SNOWFLAKE_WORKER_ID must be an integer between 0 and 1023/,
        );
    });

    test('rejects a negative worker id at import time', () => {
        jest.resetModules();
        process.env.SNOWFLAKE_WORKER_ID = '-1';
        expect(() => require('./snowflake')).toThrow(
            /SNOWFLAKE_WORKER_ID must be an integer between 0 and 1023/,
        );
    });
});
