import { z } from 'zod';
import {
    usernameSchema,
    loginSchema,
    passwordSchema,
    bioSchema,
    objectIdSchema,
} from '@/validation/schemas/common';

/**
 * Update profile validation
 */
export const updateProfileSchema = z.object({
    bio: z.string().max(500).optional(),
    phoneNumber: z.string().max(20).optional(),
    email: z.string().email().optional(),
});

/**
 * Change password validation
 */
export const changePasswordSchema = z.object({
    currentPassword: passwordSchema,
    newPassword: passwordSchema,
});

/**
 * Custom status validation
 */
export const customStatusSchema = z.object({
    text: z.string().max(120).optional(),
    emoji: z.string().max(64).optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    expiresInMinutes: z.number().positive().nullable().optional(),
    clear: z.boolean().optional(),
});

/**
 * Bulk status fetch validation
 */
export const bulkStatusSchema = z.object({
    usernames: z
        .array(z.string())
        .max(200, 'Cannot fetch more than 200 statuses at once'),
});

/**
 * Change login validation
 */
export const changeLoginSchema = z.object({
    newLogin: loginSchema,
    password: passwordSchema,
});

/**
 * User ID parameter validation
 */
export const userIdParamSchema = z.object({
    userId: objectIdSchema,
});

/**
 * Filename parameter validation
 */
export const filenameParamSchema = z.object({
    filename: z
        .string()
        .min(1)
        .refine(
            (filename) =>
                !filename.includes('..') &&
                !filename.includes('/') &&
                !filename.includes('\\'),
            { message: 'Invalid filename' },
        ),
});

/**
 * Username style validation
 */
export const usernameStyleSchema = z.object({
    usernameFont: z.string().max(50).optional(),
    usernameGradient: z
        .object({
            enabled: z.boolean(),
            colors: z
                .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
                .min(2)
                .max(5),
            angle: z.number().min(0).max(360),
        })
        .optional(),
    usernameGlow: z
        .object({
            enabled: z.boolean(),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            intensity: z.number().min(0).max(20),
        })
        .optional(),
});

/**
 * Change username validation
 */
export const changeUsernameSchema = z.object({
    newUsername: usernameSchema,
});

/**
 * Language preference validation
 */
export const languageSchema = z.object({
    language: z.string().min(2).max(10), // e.g., "en", "es", "fr-FR"
});

/**
 * Bio update validation
 */
export const bioUpdateSchema = z.object({
    bio: bioSchema,
});

/**
 * Pronouns update validation
 */
export const pronounsUpdateSchema = z.object({
    pronouns: z.string().max(60).optional(),
});

/**
 * Display name update validation
 */
export const displayNameUpdateSchema = z.object({
    displayName: z.string().min(1).max(32).optional(),
});

/**
 * Settings validation schema
 */
export const settingsSchema = z.object({
    muteNotifications: z.boolean().optional(),
    useDiscordStyleMessages: z.boolean().optional(),
    ownMessagesAlign: z.enum(['left', 'right']).optional(),
    otherMessagesAlign: z.enum(['left', 'right']).optional(),
    showYouLabel: z.boolean().optional(),
    ownMessageColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
    otherMessageColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
});

export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;
export type CustomStatusRequest = z.infer<typeof customStatusSchema>;
export type BulkStatusRequest = z.infer<typeof bulkStatusSchema>;
export type ChangeLoginRequest = z.infer<typeof changeLoginSchema>;
export type UsernameStyleRequest = z.infer<typeof usernameStyleSchema>;
export type ChangeUsernameRequest = z.infer<typeof changeUsernameSchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type LanguageRequest = z.infer<typeof languageSchema>;
export type BioUpdateRequest = z.infer<typeof bioUpdateSchema>;
export type PronounsUpdateRequest = z.infer<typeof pronounsUpdateSchema>;
export type DisplayNameUpdateRequest = z.infer<typeof displayNameUpdateSchema>;
export type SettingsRequest = z.infer<typeof settingsSchema>;
