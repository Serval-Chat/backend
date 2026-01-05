import { z } from 'zod';
import {
    messageContentSchema,
    objectIdSchema,
    usernameSchema,
} from '@/validation/schemas/common';

// Send message validation
export const sendMessageSchema = z.object({
    to: usernameSchema,
    content: messageContentSchema,
    attachments: z.array(z.string().url()).optional(),
});

// Edit message validation
export const editMessageSchema = z.object({
    content: messageContentSchema,
});

// Message ID parameter validation
export const messageIdParamSchema = z.object({
    id: objectIdSchema,
});

// User ID and message ID parameter validation
export const userMessageIdParamSchema = z.object({
    userId: objectIdSchema,
    messageId: objectIdSchema,
});

// Query parameters for fetching messages
export const messagesQuerySchema = z.object({
    userId: objectIdSchema,
    limit: z
        .string()
        .optional()
        .transform((val) => (val ? parseInt(val, 10) : 50)),
    before: z.string().optional(), // Can be either ObjectId or ISO 8601 timestamp
    after: z.string().datetime().optional(), // ISO 8601 timestamp
    around: objectIdSchema.optional(), // Message ID to fetch context around
});

// Mark messages as read validation
export const markAsReadSchema = z.object({
    messageIds: z.array(objectIdSchema),
});

// Conversation query parameters
export const conversationQuerySchema = z.object({
    userId: objectIdSchema,
    limit: z.string().optional(),
    before: z.string().optional(), // Can be either ObjectId or ISO 8601 timestamp
});

export type SendMessageRequest = z.infer<typeof sendMessageSchema>;
export type EditMessageRequest = z.infer<typeof editMessageSchema>;
export type MessageIdParam = z.infer<typeof messageIdParamSchema>;
export type MarkAsReadRequest = z.infer<typeof markAsReadSchema>;
