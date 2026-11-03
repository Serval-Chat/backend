import {
    DEFAULT_DELETED_MESSAGE_RETENTION_MINUTES,
    getDeletedMessageRetentionCutoff,
    sanitizeDeletedMessageRetentionMinutes,
} from '@/utils/deletedMessageRetention';

describe('deleted message retention policy', () => {
    it('uses the maximum window for missing or malformed stored values', () => {
        expect(sanitizeDeletedMessageRetentionMinutes(undefined)).toBe(4320);
        expect(sanitizeDeletedMessageRetentionMinutes('30')).toBe(4320);
        expect(
            sanitizeDeletedMessageRetentionMinutes(Number.POSITIVE_INFINITY),
        ).toBe(DEFAULT_DELETED_MESSAGE_RETENTION_MINUTES);
    });

    it('snaps stored values to the nearest supported duration', () => {
        expect(sanitizeDeletedMessageRetentionMinutes(0)).toBe(5);
        expect(sanitizeDeletedMessageRetentionMinutes(10.9)).toBe(10);
        expect(sanitizeDeletedMessageRetentionMinutes(15.9)).toBe(20);
        expect(sanitizeDeletedMessageRetentionMinutes(45)).toBe(30);
        expect(sanitizeDeletedMessageRetentionMinutes(5000)).toBe(4320);
    });

    it('computes a cutoff from a sanitized setting', () => {
        const now = new Date('2026-11-02T12:00:00.000Z');
        expect(getDeletedMessageRetentionCutoff(30, now)).toEqual(
            new Date('2026-11-02T11:30:00.000Z'),
        );
        expect(getDeletedMessageRetentionCutoff(-1, now)).toEqual(
            new Date(now.getTime() - 5 * 60_000),
        );
    });
});
