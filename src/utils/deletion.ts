import crypto from 'crypto';
import { getAvatarStorage } from './storage';
import logger from './logger';

/**
 * Generate an anonymized username for deleted users.
 * Uses userId for consistency if available, otherwise generates random suffix.
 */
export function generateAnonymizedUsername(userId?: string): string {
    if (userId) {
        return `deleted_user_${userId}`;
    }
    const suffix = crypto.randomInt(10000, 99999);
    return `Deleted User #${suffix}`;
}

/**
 * Placeholder path for deleted user avatars.
 * Points to a static asset that represents deleted users.
 */
export const DELETED_AVATAR_PATH = '/assets/deleted-user-avatar.png';

/**
 * Delete user's avatar using the configured storage driver
 */
export async function deleteAvatarFile(
    avatarPath: string | undefined,
): Promise<void> {
    if (!avatarPath || avatarPath === DELETED_AVATAR_PATH) {
        return;
    }

    try {
        const storage = getAvatarStorage();
        await storage.deleteAvatar(avatarPath);
    } catch (error) {
        logger.error('Failed to delete avatar file', error);
    }
}
