/**
 * Abstract storage driver interface for avatar management if I wanna use some other storage driver in the future
 */
export interface IAvatarStorage {
    /**
     * Delete an avatar from storage
     * @param avatarPath - Path of the avatar
     */
    deleteAvatar(avatarPath: string): Promise<void>;

    /**
     * Upload an avatar to storage
     * @param file - File buffer or path
     * @param userId - User ID for naming
     * @returns Path to the uploaded avatar
     */
    uploadAvatar(file: Buffer | string, userId: string): Promise<string>;
}

/**
 * Filesystem-based avatar storage implementation
 */
import fs from 'fs/promises';
import path from 'path';
import logger from '@/utils/logger';

export class FilesystemAvatarStorage implements IAvatarStorage {
    private baseDir: string;

    constructor(
        baseDir: string = path.join(
            process.cwd(),
            'public',
            'uploads',
            'avatars',
        ),
    ) {
        this.baseDir = baseDir;
    }

    async deleteAvatar(avatarPath: string): Promise<void> {
        if (!avatarPath || avatarPath.includes('deleted-user-avatar')) {
            return; // Don't delete system avatar
        }

        try {
            const fullPath = path.join(this.baseDir, path.basename(avatarPath));
            await fs.unlink(fullPath);
        } catch (error) {
            logger.error('Failed to delete avatar:', error);
        }
    }

    async uploadAvatar(file: Buffer | string, userId: string): Promise<string> {
        const filename = `${userId}-${Date.now()}.png`;
        const fullPath = path.join(this.baseDir, filename);

        if (Buffer.isBuffer(file)) {
            await fs.writeFile(fullPath, file);
        } else {
            await fs.copyFile(file, fullPath);
        }

        return `/uploads/avatars/${filename}`;
    }
}

/**
 * Get the configured avatar storage driver
 */
let storageDriver: IAvatarStorage;

export function getAvatarStorage(): IAvatarStorage {
    if (!storageDriver) {
        storageDriver = new FilesystemAvatarStorage();
    }

    return storageDriver;
}
