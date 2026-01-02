import type { IUser } from '@/models/User';
import logger from '@/utils/logger';

export interface ActiveCustomStatus {
    text: string;
    emoji?: string;
    expiresAt: Date | null;
    updatedAt: Date;
}

export interface SerializedCustomStatus {
    text: string;
    emoji: string | null;
    expiresAt: string | null;
    updatedAt: string;
}

type MutableUser = Pick<IUser, 'customStatus'> & {
    markModified?: (path: string) => void;
    save?: () => Promise<unknown>;
};

type CustomStatusValue = ActiveCustomStatus | null;

// Check if a custom status has expired
const isExpired = (expiresAt: Date | null | undefined): boolean => {
    if (!expiresAt) return false;
    return expiresAt.getTime() <= Date.now();
};

// Clear expired custom status from the database
const clearExpiredStatus = async (user: MutableUser): Promise<void> => {
    // Only attempt to save if the user has Mongoose methods
    if (!user.save || !user.markModified) {
        return;
    }

    try {
        user.customStatus = null;
        user.markModified('customStatus');
        await user.save();
    } catch (err) {
        logger.error('Failed to clear expired custom status', err);
    }
};

// Get the active custom status for a user, filtering out expired statuses
// Automatically clears expired statuses from the database
export const getActiveCustomStatus = (user: MutableUser): CustomStatusValue => {
    const status = user.customStatus as ActiveCustomStatus | null | undefined;
    if (!status || (!status.text && !status.emoji)) {
        return null;
    }

    if (isExpired(status.expiresAt)) {
        void clearExpiredStatus(user);
        return null;
    }

    const normalized: ActiveCustomStatus = {
        text: status.text,
        expiresAt: status.expiresAt ?? null,
        updatedAt: status.updatedAt ?? new Date(),
    };

    if (status.emoji) {
        normalized.emoji = status.emoji;
    }

    return normalized;
};

export const serializeCustomStatus = (
    status: CustomStatusValue,
): SerializedCustomStatus | null => {
    if (!status) return null;

    return {
        text: status.text,
        emoji: status.emoji ?? null,
        expiresAt: status.expiresAt ? status.expiresAt.toISOString() : null,
        updatedAt: status.updatedAt.toISOString(),
    };
};

// Get serialized custom status for a user (for API responses)
export const getSerializedCustomStatus = (
    user: MutableUser,
): SerializedCustomStatus | null => {
    const active = getActiveCustomStatus(user);
    return serializeCustomStatus(active);
};

export const resolveSerializedCustomStatus = (
    rawStatus: any,
): SerializedCustomStatus | null => {
    if (!rawStatus) return null;

    const hasContent = Boolean(
        (rawStatus.text && rawStatus.text.trim().length > 0) || rawStatus.emoji,
    );
    if (!hasContent) return null;

    const expiresAt = rawStatus.expiresAt
        ? new Date(rawStatus.expiresAt)
        : null;
    if (isExpired(expiresAt)) {
        return null;
    }

    const updatedAt = rawStatus.updatedAt
        ? new Date(rawStatus.updatedAt)
        : new Date();

    return {
        text: rawStatus.text ?? '',
        emoji: rawStatus.emoji ?? null,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        updatedAt: updatedAt.toISOString(),
    };
};
