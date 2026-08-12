import { z } from 'zod';
import { MAX_MESSAGE_LENGTH } from '@/config/env';
import { PRESENCE_STATUSES } from '@/types/presence';
import { isValidSnowflakeId } from '@/utils/snowflake';

const MAX_NO_EMBEDS_URLS = 25;

const snowflake = (label: string): z.ZodType<string> =>
    z.string().refine(isValidSnowflakeId, {
        message: `${label} must be a valid snowflake ID`,
    });

const MessageAttachmentSchema = z
    .object({
        attachmentId: z.string().min(1).max(255),
        type: z.enum(['image', 'video', 'audio', 'text', 'file']),
        mimeType: z.string().min(1).max(255),
        name: z.string().min(1).max(255),
        size: z.number().nonnegative(),
        width: z.number().positive().optional(),
        height: z.number().positive().optional(),
        spoiler: z.boolean().optional(),
    })
    .strict()
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

const MessagePollSchema = z
    .object({
        title: z.string().min(1).max(192),
        options: z
            .array(
                z
                    .object({
                        text: z.string().min(1).max(192),
                        emoji: z.string().max(100).optional(),
                        emojiType: z.enum(['unicode', 'custom']).optional(),
                        emojiId: snowflake('Emoji ID').optional(),
                    })
                    .strict(),
            )
            .min(1)
            .max(10),
        multiSelect: z.boolean(),
        expiresAt: z
            .string()
            .datetime()
            .refine((value) => new Date(value).getTime() > Date.now(), {
                message: 'Poll expiry must be in the future',
            })
            .optional(),
    })
    .strict();

const messageBodyFields = {
    text: z
        .string()
        .max(
            MAX_MESSAGE_LENGTH,
            `Message text too long (max ${MAX_MESSAGE_LENGTH} characters)`,
        )
        .optional()
        .default(''),
    replyToId: snowflake('Reply target ID').optional(),
    stickerId: snowflake('Sticker ID').optional(),
    attachments: z
        .array(MessageAttachmentSchema)
        .max(10, 'Too many attachments (max 10)')
        .optional()
        .default([]),
    poll: MessagePollSchema.optional(),
    noEmbeds: z.boolean().optional(),
    noEmbedsUrls: z
        .array(z.string().url().max(2048))
        .max(
            MAX_NO_EMBEDS_URLS,
            `Too many suppressed URLs (max ${MAX_NO_EMBEDS_URLS})`,
        )
        .optional(),
};

const hasContent = {
    check: (data: {
        text: string;
        stickerId?: string;
        attachments: unknown[];
        poll?: unknown;
    }): boolean =>
        data.text.length > 0 ||
        data.stickerId !== undefined ||
        data.attachments.length > 0 ||
        data.poll !== undefined,
    error: {
        message: 'Message text, sticker, or poll is required',
        path: ['text'],
    },
};

export const SendMessageDmSchema = z
    .object({
        receiverId: snowflake('Receiver ID'),
        ...messageBodyFields,
    })
    .strict()
    .refine(hasContent.check, hasContent.error);

export const EditMessageDmSchema = z
    .object({
        messageId: snowflake('Message ID'),
        text: z
            .string()
            .min(1, 'Message text is required')
            .max(
                MAX_MESSAGE_LENGTH,
                `Message text too long (max ${MAX_MESSAGE_LENGTH} characters)`,
            ),
    })
    .strict();

export const DeleteMessageDmSchema = z
    .object({
        messageId: snowflake('Message ID'),
    })
    .strict();

export const MarkDmReadSchema = z
    .object({
        peerId: snowflake('Peer ID'),
    })
    .strict();

export const TypingDmSchema = z
    .object({
        receiverId: snowflake('Receiver ID'),
    })
    .strict();

export const JoinServerSchema = z
    .object({
        serverId: snowflake('Server ID'),
    })
    .strict();

export const LeaveServerSchema = z
    .object({
        serverId: snowflake('Server ID'),
    })
    .strict();

export const JoinChannelSchema = z
    .object({
        serverId: snowflake('Server ID'),
        channelId: snowflake('Channel ID'),
    })
    .strict();

export const LeaveChannelSchema = z
    .object({
        channelId: snowflake('Channel ID'),
    })
    .strict();

export const JoinVoiceSchema = z
    .object({
        serverId: snowflake('Server ID'),
        channelId: snowflake('Channel ID'),
    })
    .strict();

export const LeaveVoiceSchema = z
    .object({
        serverId: snowflake('Server ID'),
        channelId: snowflake('Channel ID'),
    })
    .strict();

export const UpdateVoiceStateSchema = z
    .object({
        serverId: snowflake('Server ID'),
        channelId: snowflake('Channel ID'),
        isMuted: z.boolean(),
        isDeafened: z.boolean(),
    })
    .strict();

export const SendMessageServerSchema = z
    .object({
        serverId: snowflake('Server ID'),
        channelId: snowflake('Channel ID'),
        ...messageBodyFields,
    })
    .strict()
    .refine(hasContent.check, hasContent.error);

export const EditMessageServerSchema = z
    .object({
        messageId: snowflake('Message ID'),
        text: z
            .string()
            .min(1, 'Message text is required')
            .max(
                MAX_MESSAGE_LENGTH,
                `Message text too long (max ${MAX_MESSAGE_LENGTH} characters)`,
            ),
    })
    .strict();

export const DeleteMessageServerSchema = z
    .object({
        serverId: snowflake('Server ID'),
        messageId: snowflake('Message ID'),
    })
    .strict();

export const MarkChannelReadSchema = z
    .object({
        serverId: snowflake('Server ID'),
        channelId: snowflake('Channel ID'),
    })
    .strict();

export const TypingServerSchema = z
    .object({
        serverId: snowflake('Server ID'),
        channelId: snowflake('Channel ID'),
    })
    .strict();

export const SetStatusSchema = z
    .object({
        status: z
            .string()
            .max(100, 'Status text too long (max 100 characters)'),
    })
    .strict();

export const SetPresenceStatusSchema = z
    .object({
        status: z.enum(PRESENCE_STATUSES),
    })
    .strict();

export const AddReactionSchema = z
    .object({
        messageId: snowflake('Message ID'),
        emoji: z
            .string()
            .min(1, 'Emoji is required')
            .max(100, 'Emoji too long'),
        emojiType: z.enum(['unicode', 'custom']).default('unicode'),
        emojiId: snowflake('Emoji ID').optional(),
        messageType: z.enum(['dm', 'server']),
    })
    .strict()
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

export const RemoveReactionSchema = z
    .object({
        messageId: snowflake('Message ID'),
        emoji: z
            .string()
            .min(1, 'Emoji is required')
            .max(100, 'Emoji too long'),
        emojiType: z.enum(['unicode', 'custom']).default('unicode'),
        emojiId: snowflake('Emoji ID').optional(),
        messageType: z.enum(['dm', 'server']),
    })
    .strict();

export const PingSchema = z.object({}).strict().optional();
