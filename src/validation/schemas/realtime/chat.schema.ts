import { z } from 'zod';

/**
 * Schema for sending a direct message.
 */
export const SendMessageSchema = z.object({
    receiver: z.string(),
    text: z.string().min(1).max(5000),
    replyToId: z.string().optional(),
});

/**
 * Schema for marking a DM conversation as read.
 */
export const MarkReadSchema = z.object({
    peerId: z.string(),
});

/**
 * Schema for typing indicators in DMs.
 */
export const TypingSchema = z.object({
    to: z.string(),
});

/**
 * Schema for editing a direct message.
 */
export const EditMessageSchema = z.object({
    messageId: z.string(),
    text: z.string().min(1).max(5000),
});

/**
 * Schema for deleting a direct message.
 */
export const DeleteMessageSchema = z.object({
    messageId: z.string(),
});
