import type { Schema } from 'mongoose';

import { SNOWFLAKE_WORKER_ID } from '@/config/env';

const EPOCH_MS = 1704067200000; // 2024-01-01T00:00:00.000Z

const WORKER_ID_BITS = 10n;
const SEQUENCE_BITS = 12n;

export const MAX_WORKER_ID = 2 ** Number(WORKER_ID_BITS) - 1;
export const MAX_SEQUENCE = 2 ** Number(SEQUENCE_BITS) - 1;

const WORKER_ID_SHIFT = SEQUENCE_BITS;
const TIMESTAMP_SHIFT = WORKER_ID_BITS + SEQUENCE_BITS;

const ID_STRING_LENGTH = 19;

if (
    !Number.isInteger(SNOWFLAKE_WORKER_ID) ||
    SNOWFLAKE_WORKER_ID < 0 ||
    SNOWFLAKE_WORKER_ID > MAX_WORKER_ID
) {
    throw new Error(
        `SNOWFLAKE_WORKER_ID must be an integer between 0 and ${MAX_WORKER_ID}, got ${SNOWFLAKE_WORKER_ID}`,
    );
}

const workerId = BigInt(SNOWFLAKE_WORKER_ID);

let lastTimestamp = -1n;
let sequence = 0n;

/**
 * generates a 63-bit, time-sortable snowflake ID as a zero-padded decimal
 * string: `[41 bits ms-since-EPOCH][10 bits workerId][12 bits sequence]`.
 *
 * safe for up to 4096 IDs/ms per worker and ~69 years from EPOCH_MS
 * before the timestamp field overflows.
 */
export function generateSnowflakeId(): string {
    let timestamp = BigInt(Date.now() - EPOCH_MS);

    if (timestamp < lastTimestamp) {
        throw new Error(
            `Clock moved backwards by ${lastTimestamp - timestamp}ms; refusing to generate Snowflake ID`,
        );
    }

    if (timestamp === lastTimestamp) {
        sequence = (sequence + 1n) & BigInt(MAX_SEQUENCE);
        if (sequence === 0n) {
            while (timestamp <= lastTimestamp) {
                timestamp = BigInt(Date.now() - EPOCH_MS);
            }
        }
    } else {
        sequence = 0n;
    }

    lastTimestamp = timestamp;

    const id =
        (timestamp << TIMESTAMP_SHIFT) |
        (workerId << WORKER_ID_SHIFT) |
        sequence;

    return id.toString().padStart(ID_STRING_LENGTH, '0');
}

/**
 * extracts the creation Date encoded in a snowflake ID. replaces the old
 * pattern of reading a creation timestamp out of an ObjectId.
 */
export function snowflakeIdToDate(id: string): Date {
    const value = BigInt(id);
    const timestamp = value >> TIMESTAMP_SHIFT;
    return new Date(Number(timestamp) + EPOCH_MS);
}

/**
 * true if `id` is a syntactically valid snowflake ID from this generator
 * (19-digit, zero-padded decimal string). does not verify the id exists
 * in the database.
 */
export function isValidSnowflakeId(id: unknown): id is string {
    return typeof id === 'string' && /^\d{19}$/.test(id);
}

// sentinel sender id for messages with no real human author (e.g.
// webhook-posted messages). shaped as all-zero 19 digits so it passes
// the same validation/sorting as real snowflake ids without colliding
// with one a generator could mint.
export const SYSTEM_SENDER_ID = '0'.repeat(ID_STRING_LENGTH);

/**
 * low-level encoder for the one-time backfill migration - mints IDs stamped
 * with a document's *original* creation time so backfilled IDs preserve the
 * collection's existing creation order instead of clustering around "now".
 * not for the live write path: no collision protection, the caller must
 * ensure (timestamp, sequence) pairs are unique.
 *
 * timestamps before EPOCH_MS are clamped to 0 - documents predating
 * 2024-01-01 sort together at the start of the ID space.
 */
export function encodeSnowflakeId(
    timestampMs: number,
    workerIdValue: number,
    sequenceValue: number,
): string {
    const timestamp = BigInt(Math.max(0, timestampMs - EPOCH_MS));
    const id =
        (timestamp << TIMESTAMP_SHIFT) |
        (BigInt(workerIdValue) << WORKER_ID_SHIFT) |
        BigInt(sequenceValue);

    return id.toString().padStart(ID_STRING_LENGTH, '0');
}

/**
 * adds a `snowflakeId` field to a schema and auto-generates it on first
 * save. this is the public identifier - use it across API/WebSocket
 * boundaries while keeping Mongo's `_id` internal.
 *
 * the unique index is `sparse` so pre-migration documents without a
 * `snowflakeId` yet don't collide on null - every document written
 * after this plugin is applied gets a real value via `pre('validate')`.
 */
export const snowflakeIdPlugin = (schema: Schema): void => {
    schema.add({
        snowflakeId: {
            type: String,
            unique: true,
            sparse: true,
        },
    });

    schema.pre('validate', function (): void {
        if (this.get('snowflakeId') === undefined) {
            this.set('snowflakeId', generateSnowflakeId());
        }
    });
};
