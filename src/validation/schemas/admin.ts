import { z } from 'zod';
import {
    objectIdSchema,
    limitSchema,
    offsetSchema,
    searchSchema,
    filterSchema,
    booleanQuerySchema,
    reasonSchema,
} from './common';

/**
 * Query parameters for listing users
 */
export const listUsersQuerySchema = z.object({
    limit: limitSchema,
    offset: offsetSchema,
    search: searchSchema,
    filter: filterSchema,
    includeDeleted: booleanQuerySchema,
});

/**
 * User ID parameter validation
 */
export const userIdParamSchema = z.object({
    id: objectIdSchema,
});

/**
 * Soft delete user validation
 */
export const softDeleteUserSchema = z.object({
    reason: reasonSchema.default('No reason provided'),
});

/**
 * Ban user validation
 */
export const banUserSchema = z.object({
    reason: reasonSchema,
    duration: z.number().int().min(1), // Duration in minutes (must be positive)
});

/**
 * Warn user validation
 */
export const warnUserSchema = z.object({
    message: reasonSchema, // The admin route uses 'message' field
});

/**
 * Query parameters for audit logs
 */
export const auditLogsQuerySchema = z.object({
    limit: limitSchema,
    offset: offsetSchema,
    actionType: z.string().optional(),
    adminId: objectIdSchema.optional(),
    targetUserId: objectIdSchema.optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
});

/**
 * Query parameters for viewing bans
 */
export const bansQuerySchema = z.object({
    limit: limitSchema,
    offset: offsetSchema,
    active: booleanQuerySchema,
    userId: objectIdSchema.optional(),
});

/**
 * Query parameters for viewing warnings
 */
export const warningsQuerySchema = z.object({
    limit: limitSchema,
    offset: offsetSchema,
    userId: objectIdSchema.optional(),
    acknowledged: booleanQuerySchema,
    severity: z.enum(['low', 'medium', 'high']).optional(),
});

/**
 * Reset user profile fields validation
 */
export const resetProfileSchema = z.object({
    fields: z
        .array(z.enum(['username', 'displayName', 'pronouns', 'bio']))
        .min(1),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type SoftDeleteUserRequest = z.infer<typeof softDeleteUserSchema>;
export type BanUserRequest = z.infer<typeof banUserSchema>;
export type WarnUserRequest = z.infer<typeof warnUserSchema>;
export type AuditLogsQuery = z.infer<typeof auditLogsQuerySchema>;
export type ResetProfileRequest = z.infer<typeof resetProfileSchema>;
