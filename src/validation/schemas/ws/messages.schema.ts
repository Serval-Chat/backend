import { z } from 'zod';
import { MAX_MESSAGE_LENGTH } from '@/config/env';

const MessageAttachmentSchema = z
    .object({
        attachmentId: z.string().min(1),
        type: z.enum(['image', 'video', 'audio', 'text', 'file']),
        mimeType: z.string().min(1),
        name: z.string().min(1),
        size: z.number().nonnegative(),
        width: z.number().positive().optional(),
        height: z.number().positive().optional(),
        spoiler: z.boolean().optional(),
    })
    .refine(
        (data) =>
            data.type !== 'image' ||
            (data.width !== undefined && data.height !== undefined),
        {
            message: 'Image attachments require width and height',
            path: ['width'],
        },
    )
    .refine(
        (data) =>
            data.type !== 'video' ||
            (data.width !== undefined && data.height !== undefined),
        {
            message: 'Video attachments require width and height',
            path: ['width'],
        },
    );

export const SendMessageDmSchema = z
    .object({
        receiverId: z.string().min(1, 'Receiver ID is required'),
        text: z
            .string()
            .max(
                MAX_MESSAGE_LENGTH,
                `Message text too long (max ${MAX_MESSAGE_LENGTH} characters)`,
            )
            .optional()
            .default(''),
        replyToId: z.string().optional(),
        stickerId: z.string().optional(),
        attachments: z.array(MessageAttachmentSchema).optional().default([]),
        poll: z
            .object({
                title: z.string().min(1).max(192),
                options: z
                    .array(
                        z.object({
                            text: z.string().min(1).max(192),
                            emoji: z.string().optional(),
                            emojiType: z.enum(['unicode', 'custom']).optional(),
                            emojiId: z.string().optional(),
                        }),
                    )
                    .min(1)
                    .max(10),
                multiSelect: z.boolean(),
                expiresAt: z.string().datetime().optional(),
            })
            .optional(),
        noEmbeds: z.boolean().optional(),
    })
    .refine(
        (data) =>
            data.text.length > 0 ||
            data.stickerId !== undefined ||
            data.attachments.length > 0 ||
            data.poll !== undefined,
        {
            message: 'Message text, sticker, or poll is required',
            path: ['text'],
        },
    );

export const EditMessageDmSchema = z.object({
    messageId: z.string().min(1, 'Message ID is required'),
    text: z
        .string()
        .min(1, 'Message text is required')
        .max(
            MAX_MESSAGE_LENGTH,
            `Message text too long (max ${MAX_MESSAGE_LENGTH} characters)`,
        ),
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

export const SendMessageServerSchema = z
    .object({
        serverId: z.string().min(1, 'Server ID is required'),
        channelId: z.string().min(1, 'Channel ID is required'),
        text: z
            .string()
            .max(
                MAX_MESSAGE_LENGTH,
                `Message text too long (max ${MAX_MESSAGE_LENGTH} characters)`,
            )
            .optional()
            .default(''),
        replyToId: z.string().optional(),
        stickerId: z.string().optional(),
        attachments: z.array(MessageAttachmentSchema).optional().default([]),
        poll: z
            .object({
                title: z.string().min(1).max(192),
                options: z
                    .array(
                        z.object({
                            text: z.string().min(1).max(192),
                            emoji: z.string().optional(),
                            emojiType: z.enum(['unicode', 'custom']).optional(),
                            emojiId: z.string().optional(),
                        }),
                    )
                    .min(1)
                    .max(10),
                multiSelect: z.boolean(),
                expiresAt: z.string().datetime().optional(),
            })
            .optional(),
        noEmbeds: z.boolean().optional(),
    })
    .refine(
        (data) =>
            data.text.length > 0 ||
            data.stickerId !== undefined ||
            data.attachments.length > 0 ||
            data.poll !== undefined,
        {
            message: 'Message text, sticker, or poll is required',
            path: ['text'],
        },
    );

export const EditMessageServerSchema = z.object({
    messageId: z.string().min(1, 'Message ID is required'),
    text: z
        .string()
        .min(1, 'Message text is required')
        .max(
            MAX_MESSAGE_LENGTH,
            `Message text too long (max ${MAX_MESSAGE_LENGTH} characters)`,
        ),
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

export const SetPresenceStatusSchema = z.object({
    status: z.enum(['online', 'idle', 'dnd']),
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
            if (
                data.emojiType === 'custom' &&
                (data.emojiId === undefined || data.emojiId === '')
            ) {
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
