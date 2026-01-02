import { z } from 'zod';
import { objectIdSchema } from '@/validation/schemas/common';

// Get emoji by ID parameter validation
export const getEmojiByIdParamsSchema = z.object({
    emojiId: objectIdSchema,
});

// Get all emojis query validation
export const getAllEmojisQuerySchema = z.object({
    search: z.string().optional(),
    serverId: objectIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).default(0),
});
