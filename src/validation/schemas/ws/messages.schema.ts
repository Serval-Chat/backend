import { z } from 'zod';

// ============================================================================
// Direct Message Validation Schemas
// ============================================================================

export const SendMessageDmSchema = z.object({
    receiverId: z.string().min(1, 'Receiver ID is required'),
    text: z
        .string()
        .min(1, 'Message text is required')
        .max(2000, 'Message text too long (max 2000 characters)'),
    replyToId: z.string().optional(),
});

export const EditMessageDmSchema = z.object({
    messageId: z.string().min(1, 'Message ID is required'),
    text: z
        .string()
        .min(1, 'Message text is required')
        .max(2000, 'Message text too long (max 2000 characters)'),
});

export const DeleteMessageDmSchema = z.object({
    messageId: z.string().min(1, 'Message ID is required'),
});

export const MarkDmReadSchema = z.object({
    peerId: z.string().min(1, 'Peer ID is required'),
});

export const TypingDmSchema = z.object({
    receiverId: z.string().min(1, 'Receiver ID is required'),
});

// ============================================================================
// Server Message Validation Schemas
// ============================================================================

export const JoinServerSchema = z.object({
    serverId: z.string().min(1, 'Server ID is required'),
});

export const LeaveServerSchema = z.object({
    serverId: z.string().min(1, 'Server ID is required'),
});

export const JoinChannelSchema = z.object({
    serverId: z.string().min(1, 'Server ID is required'),
    channelId: z.string().min(1, 'Channel ID is required'),
});

export const LeaveChannelSchema = z.object({
    channelId: z.string().min(1, 'Channel ID is required'),
});

export const SendMessageServerSchema = z.object({
    serverId: z.string().min(1, 'Server ID is required'),
    channelId: z.string().min(1, 'Channel ID is required'),
    text: z
        .string()
        .min(1, 'Message text is required')
        .max(2000, 'Message text too long (max 2000 characters)'),
    replyToId: z.string().optional(),
});

export const EditMessageServerSchema = z.object({
    messageId: z.string().min(1, 'Message ID is required'),
    text: z
        .string()
        .min(1, 'Message text is required')
        .max(2000, 'Message text too long (max 2000 characters)'),
});

export const DeleteMessageServerSchema = z.object({
    serverId: z.string().min(1, 'Server ID is required'),
    messageId: z.string().min(1, 'Message ID is required'),
});

export const MarkChannelReadSchema = z.object({
    serverId: z.string().min(1, 'Server ID is required'),
    channelId: z.string().min(1, 'Channel ID is required'),
});

export const TypingServerSchema = z.object({
    serverId: z.string().min(1, 'Server ID is required'),
    channelId: z.string().min(1, 'Channel ID is required'),
});

// ============================================================================
// Presence & Status Validation Schemas
// ============================================================================

export const SetStatusSchema = z.object({
    status: z.string().max(100, 'Status text too long (max 100 characters)'),
});

// ============================================================================
// Reaction Validation Schemas
// ============================================================================

export const AddReactionSchema = z
    .object({
        messageId: z.string().min(1, 'Message ID is required'),
        emoji: z.string().min(1, 'Emoji is required'),
        emojiType: z.enum(['unicode', 'custom']).default('unicode'),
        emojiId: z.string().optional(),
        messageType: z.enum(['dm', 'server']),
    })
    .refine(
        (data) => {
            if (data.emojiType === 'custom' && !data.emojiId) {
                return false;
            }
            return true;
        },
        {
            message: 'Emoji ID is required for custom emojis',
            path: ['emojiId'],
        },
    );

export const RemoveReactionSchema = z.object({
    messageId: z.string().min(1, 'Message ID is required'),
    emoji: z.string().min(1, 'Emoji is required'),
    emojiType: z.enum(['unicode', 'custom']).default('unicode'),
    emojiId: z.string().optional(),
    messageType: z.enum(['dm', 'server']),
});
