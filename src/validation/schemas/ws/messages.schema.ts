import { z } from 'zod';
import { MAX_MESSAGE_LENGTH } from '@/config/env';

export const SendMessageDmSchema = z.object({
    receiverId: z.string().min(1, 'Receiver ID is required'),
    text: z
        .string()
        .min(1, 'Message text is required')
        .max(MAX_MESSAGE_LENGTH, `Message text too long (max ${MAX_MESSAGE_LENGTH} characters)`),
    replyToId: z.string().optional(),
});

export const EditMessageDmSchema = z.object({
    messageId: z.string().min(1, 'Message ID is required'),
    text: z
        .string()
        .min(1, 'Message text is required')
        .max(MAX_MESSAGE_LENGTH, `Message text too long (max ${MAX_MESSAGE_LENGTH} characters)`),
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

export const JoinVoiceSchema = z.object({
    serverId: z.string().min(1, 'Server ID is required'),
    channelId: z.string().min(1, 'Channel ID is required'),
});

export const LeaveVoiceSchema = z.object({
    serverId: z.string().min(1, 'Server ID is required'),
    channelId: z.string().min(1, 'Channel ID is required'),
});

export const UpdateVoiceStateSchema = z.object({
    serverId: z.string().min(1, 'Server ID is required'),
    channelId: z.string().min(1, 'Channel ID is required'),
    isMuted: z.boolean(),
    isDeafened: z.boolean(),
});

export const SendMessageServerSchema = z.object({
    serverId: z.string().min(1, 'Server ID is required'),
    channelId: z.string().min(1, 'Channel ID is required'),
    text: z
        .string()
        .min(1, 'Message text is required')
        .max(MAX_MESSAGE_LENGTH, `Message text too long (max ${MAX_MESSAGE_LENGTH} characters)`),
    replyToId: z.string().optional(),
});

export const EditMessageServerSchema = z.object({
    messageId: z.string().min(1, 'Message ID is required'),
    text: z
        .string()
        .min(1, 'Message text is required')
        .max(MAX_MESSAGE_LENGTH, `Message text too long (max ${MAX_MESSAGE_LENGTH} characters)`),
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

export const SetStatusSchema = z.object({
    status: z.string().max(100, 'Status text too long (max 100 characters)'),
});

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
            if (data.emojiType === 'custom' && (data.emojiId === undefined || data.emojiId === '')) {
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
