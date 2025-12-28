import type { Types } from 'mongoose';
import type { AdminPermissions } from '@/routes/api/v1/admin/permissions';

/**
 * User DTO for creation
 */
export interface CreateUserDTO {
    login: string;
    username: string;
    password: string;
    email?: string;
}

/**
 * User interface (domain model).
 *
 * Represents a registered user in the system.
 */
export interface IUser {
    _id: Types.ObjectId | string;
    login?: string;
    username?: string;
    displayName?: string;
    password: string;
    email?: string;
    bio?: string;
    status?: string;
    profilePicture?: string;
    usernameFont?: string;
    /**
     * Visual gradient settings for the username display.
     */
    usernameGradient?: {
        enabled: boolean;
        colors: string[];
        angle: number;
    };
    /**
     * Visual glow effect settings for the username display.
     */
    usernameGlow?: {
        enabled: boolean;
        color: string;
        intensity: number;
    };
    language?: string;
    customStatus?: {
        text: string;
        emoji?: string;
        expiresAt: Date | null;
        updatedAt: Date;
    } | null;
    /**
     * Version of the user's authentication token.
     * Incremented to invalidate all existing JWTs (global logout).
     */
    tokenVersion?: number;
    /**
     * Timestamp of when the user account was soft-deleted.
     */
    deletedAt?: Date;
    /**
     * Reason for account deletion (e.g., user request, ban).
     */
    deletedReason?: string;
    /**
     * Anonymized username used after hard-deletion for historical message context.
     */
    anonymizedUsername?: string;
    permissions?: AdminPermissions;
    createdAt?: Date;
    updatedAt?: Date;
    pronouns?: string;
    badges?: string[];
    settings?: {
        muteNotifications?: boolean;
        useDiscordStyleMessages?: boolean;
        ownMessagesAlign?: 'left' | 'right';
        otherMessagesAlign?: 'left' | 'right';
        showYouLabel?: boolean;
        ownMessageColor?: string;
        otherMessageColor?: string;
    };
    banner?: string;
}

/**
 * User Repository Interface
 *
 * Encapsulates all user-related database operations
 */
export interface IUserRepository {
    /**
     * Find user by ID (lean)
     */
    findById(id: string): Promise<IUser | null>;

    /**
     * Find multiple users by IDs
     */
    findByIds(ids: (string | Types.ObjectId)[]): Promise<IUser[]>;

    /**
     * Find user by login (username or email)
     */
    findByLogin(login: string): Promise<IUser | null>;

    /**
     * Find user by username
     */
    findByUsername(username: string): Promise<IUser | null>;

    /**
     * Find multiple users by usernames
     */
    findByUsernames(usernames: string[]): Promise<IUser[]>;

    /**
     * Find users by username prefix from a list of user IDs
     */
    findByUsernamePrefix(
        userIds: (string | Types.ObjectId)[],
        prefix: string,
        limit?: number,
    ): Promise<IUser[]>;

    /**
     * Create a new user
     */
    create(data: CreateUserDTO): Promise<IUser>;

    /**
     * Update user by ID
     */
    update(id: string, data: Partial<IUser>): Promise<IUser | null>;

    /**
     * Soft delete user (mark as deleted without removing).
     */
    softDelete(id: string, reason: string): Promise<boolean>;

    /**
     * Hard delete user by ID.
     */
    delete(id: string): Promise<boolean>;

    /**
     * Compare a password against the stored hash
     */
    comparePassword(id: string, password: string): Promise<boolean>;

    /**
     * Update user's custom status
     */
    updateCustomStatus(
        id: string,
        status: {
            text: string;
            emoji?: string;
            expiresAt: Date | null;
            updatedAt: Date;
        } | null,
    ): Promise<void>;

    /**
     * Update user's profile picture
     */
    updateProfilePicture(id: string, filename: string): Promise<void>;

    /**
     * Update user's login
     */
    updateLogin(id: string, newLogin: string): Promise<void>;

    /**
     * Update user's password
     */
    updatePassword(id: string, newPassword: string): Promise<void>;

    /**
     * Update user's username style
     */
    updateUsernameStyle(
        id: string,
        style: {
            usernameFont?: string;
            usernameGradient?: {
                enabled: boolean;
                colors: string[];
                angle: number;
            };
            usernameGlow?: {
                enabled: boolean;
                color: string;
                intensity: number;
            };
        },
    ): Promise<void>;

    /**
     * Update user's username
     */
    updateUsername(id: string, newUsername: string): Promise<void>;

    /**
     * Update user's language preference
     */
    updateLanguage(id: string, language: string): Promise<void>;

    /**
     * Update user's bio
     */
    updateBio(id: string, bio: string | null): Promise<void>;

    /**
     * Update user's pronouns
     */
    updatePronouns(id: string, pronouns: string | null): Promise<void>;

    /**
     * Update user's display name
     */
    updateDisplayName(id: string, displayName: string | null): Promise<void>;

    /**
     * Find users with pagination and filtering (for admin tho)
     */
    findMany(options: {
        limit?: number;
        offset?: number;
        search?: string;
        filter?: 'banned' | 'admin' | 'recent';
        includeDeleted?: boolean;
    }): Promise<IUser[]>;

    /**
     * Hard delete user by ID
     */
    hardDelete(id: string): Promise<boolean>;

    /**
     * Update user permissions
     */
    updatePermissions(id: string, permissions: AdminPermissions): Promise<void>;

    /**
     * Increment token version.
     */
    incrementTokenVersion(id: string): Promise<void>;

    /**
     * Remove a specific badge from all users
     */
    removeBadgeFromAllUsers(badgeId: string): Promise<void>;

    /**
     * Update user settings
     */
    updateSettings(
        id: string,
        settings: {
            muteNotifications?: boolean;
            useDiscordStyleMessages?: boolean;
            ownMessagesAlign?: 'left' | 'right';
            otherMessagesAlign?: 'left' | 'right';
            showYouLabel?: boolean;
            ownMessageColor?: string;
            otherMessageColor?: string;
        },
    ): Promise<void>;

    /**
     * Count total users
     */
    count(): Promise<number>;

    /**
     * Count users created after a certain date
     */
    countCreatedAfter(date: Date): Promise<number>;

    /**
     * Update user's banner
     */
    updateBanner(id: string, filename: string | null): Promise<void>;
}
