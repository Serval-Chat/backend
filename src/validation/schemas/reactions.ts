import { z } from 'zod';

/**
 * Validation Schemas for Reaction APIs
 *
 * Validates emoji reactions including Unicode and custom emojis.
 */

// Validate MongoDB ObjectId format
const objectIdSchema = z
    .string()
    .regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId format');

// Validate Unicode emoji (basic validation - checks for emoji unicode ranges)
const unicodeEmojiSchema = z
    .string()
    .regex(/^[\p{Emoji}\p{Emoji_Component}]+$/u, 'Invalid Unicode emoji')
    .max(10, 'Emoji too long');

/**
 * Schema for adding a reaction
 */
export const addReactionBodySchema = z
    .object({
        emoji: z.string().min(1).max(100),
        emojiType: z.enum(['unicode', 'custom']),
        emojiId: objectIdSchema.optional(),
    })
    .refine(
        (data) => {
            // If emojiType is 'custom', emojiId must be provided
            if (data.emojiType === 'custom' && !data.emojiId) {
                return false;
            }
            // If emojiType is 'unicode', validate emoji format
            if (data.emojiType === 'unicode') {
                return unicodeEmojiSchema.safeParse(data.emoji).success;
            }
            return true;
        },
        {
            message:
                'Invalid emoji: custom emojis require emojiId, unicode emojis must be valid emoji characters',
        },
    );

/**
 * Schema for removing a reaction
 */
export const removeReactionBodySchema = z
    .object({
        emoji: z.string().optional(),
        emojiId: objectIdSchema.optional(),
        scope: z.enum(['me', 'all']).optional(),
    })
    .refine((data) => data.emoji || data.emojiId, {
        message: 'Either emoji or emojiId must be provided',
    });

/**
 * Schema for message ID parameter
 */
export const messageIdParamSchema = z.object({
    messageId: objectIdSchema,
});

/**
 * Schema for server reaction parameters
 */
export const serverReactionParamsSchema = z.object({
    serverId: objectIdSchema,
    channelId: objectIdSchema,
    messageId: objectIdSchema,
});

export type AddReactionBody = z.infer<typeof addReactionBodySchema>;
export type RemoveReactionBody = z.infer<typeof removeReactionBodySchema>;
export type MessageIdParam = z.infer<typeof messageIdParamSchema>;
export type ServerReactionParams = z.infer<typeof serverReactionParamsSchema>;
