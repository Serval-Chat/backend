import { z } from 'zod';
import { usernameSchema, objectIdSchema } from '@/validation/schemas/common';

/**
 * Send friend request validation
 */
export const sendFriendRequestSchema = z.object({
    username: usernameSchema,
});

/**
 * Friend request ID parameter validation
 */
export const friendRequestIdParamSchema = z.object({
    id: objectIdSchema,
});

/**
 * Friend ID parameter validation
 */
export const friendIdParamSchema = z.object({
    friendId: objectIdSchema,
});

/**
 * Query parameters for filtering friend requests
 */
export const friendRequestQuerySchema = z.object({
    status: z.enum(['pending', 'accepted', 'rejected']).optional(),
});

/**
 * Query parameters for incoming friend requests
 */
export const incomingFriendRequestsQuerySchema = z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
});

export type SendFriendRequest = z.infer<typeof sendFriendRequestSchema>;
export type FriendRequestIdParam = z.infer<typeof friendRequestIdParamSchema>;
export type FriendIdParam = z.infer<typeof friendIdParamSchema>;
