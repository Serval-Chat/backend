export const DELETED_MESSAGE_RETENTION_OPTIONS = [
    5, 10, 20, 30, 60, 120, 360, 720, 1440, 4320,
] as const;
export const MIN_DELETED_MESSAGE_RETENTION_MINUTES = Math.min(
    ...DELETED_MESSAGE_RETENTION_OPTIONS,
);
export const MAX_DELETED_MESSAGE_RETENTION_MINUTES = Math.max(
    ...DELETED_MESSAGE_RETENTION_OPTIONS,
);
export const DEFAULT_DELETED_MESSAGE_RETENTION_MINUTES =
    MAX_DELETED_MESSAGE_RETENTION_MINUTES;

export const sanitizeDeletedMessageRetentionMinutes = (
    value: unknown,
): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_DELETED_MESSAGE_RETENTION_MINUTES;
    }

    return DELETED_MESSAGE_RETENTION_OPTIONS.reduce(
        (closest, option) =>
            Math.abs(option - value) < Math.abs(closest - value)
                ? option
                : closest,
        MIN_DELETED_MESSAGE_RETENTION_MINUTES,
    );
};

export const getDeletedMessageRetentionCutoff = (
    retentionMinutes: unknown,
    now: Date = new Date(),
): Date =>
    new Date(
        now.getTime() -
            sanitizeDeletedMessageRetentionMinutes(retentionMinutes) * 60_000,
    );
