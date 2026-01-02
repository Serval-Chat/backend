import { z } from 'zod';

// Schema for reaction events (add/remove)
// Supports both standard unicode emojis and custom emojis
// Applicable to both DM and server messages
export const ReactionEventSchema = z.object({
    messageId: z.string(),
    messageType: z.enum(['dm', 'server']),
    emoji: z.string(),
    emojiType: z.enum(['unicode', 'custom']),
    emojiId: z.string().optional(),
    serverId: z.string().optional(),
    channelId: z.string().optional(),
    otherUserId: z.string().optional(),
});

export type ReactionEventData = z.infer<typeof ReactionEventSchema>;
