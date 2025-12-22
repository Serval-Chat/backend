import { z } from 'zod';

/**
 * MongoDB ObjectId validation
 * Validates that a string is a valid 24-character hex string
 */
export const objectIdSchema = z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

/**
 * Username validation
 * Alphanumeric with underscores, hyphens, and dots, 3-20 characters
 * Rules:
 * - Can start with letter, number, or underscore (not dot or hyphen)
 * - Cannot have consecutive dots
 */
export const usernameSchema = z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(
        /^[a-zA-Z0-9_]/,
        'Username must start with a letter, number, or underscore',
    )
    .regex(
        /^[a-zA-Z0-9_.-]+$/,
        'Username can only contain letters, numbers, underscores, hyphens, and dots',
    )
    .refine(
        (val) => !val.includes('..'),
        'Username cannot contain consecutive dots',
    );

/**
 * Login validation (email or username)
 */
export const loginSchema = z
    .string()
    .min(3, 'Login must be at least 3 characters')
    .max(50, 'Login must be at most 50 characters');

/**
 * Password validation
 * Minimum 6 characters for security
 */
export const passwordSchema = z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(100, 'Password must be at most 100 characters');

/**
 * Pagination limit parameter
 */
export const limitSchema = z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50))
    .pipe(z.number().min(1).max(100));

/**
 * Pagination offset parameter
 */
export const offsetSchema = z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0))
    .pipe(z.number().min(0));

/**
 * Search query parameter
 */
export const searchSchema = z.string().optional();

/**
 * Filter parameter (generic string)
 */
export const filterSchema = z.string().optional();

/**
 * Boolean query parameter
 * Accepts 'true', 'false', '1', '0'
 */
export const booleanQuerySchema = z
    .string()
    .optional()
    .transform((val) => {
        if (!val) return undefined;
        const normalized = val.toLowerCase();
        return normalized === 'true' || normalized === '1';
    });

/**
 * ISO date string validation
 */
export const isoDateSchema = z.string().datetime();

/**
 * Optional ISO date string
 */
export const optionalIsoDateSchema = z.string().datetime().optional();

/**
 * Invite token validation
 */
export const inviteTokenSchema = z
    .string()
    .min(1, 'Invite token is required')
    .max(100, 'Invite token is too long');

/**
 * Reason text validation (for bans, warnings, deletions, etc.)
 */
export const reasonSchema = z
    .string()
    .min(1, 'Reason is required')
    .max(500, 'Reason must be at most 500 characters');

/**
 * Optional reason text
 */
export const optionalReasonSchema = z
    .string()
    .max(500, 'Reason must be at most 500 characters')
    .optional();

/**
 * Message content validation
 */
export const messageContentSchema = z
    .string()
    .min(1, 'Message content cannot be empty')
    .max(2000, 'Message content must be at most 2000 characters');

/**
 * Bio/description validation
 */
export const bioSchema = z
    .string()
    .max(500, 'Bio must be at most 500 characters')
    .optional();

/**
 * URL validation
 */
export const urlSchema = z.string().url('Invalid URL format');

/**
 * Optional URL validation
 */
export const optionalUrlSchema = z
    .string()
    .url('Invalid URL format')
    .optional();

/**
 * Color hex code validation
 */
export const colorHexSchema = z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color hex format (must be #RRGGBB)');

/**
 * Server/channel name validation
 */
export const nameSchema = z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters')
    .trim();
