import { z } from 'zod';
import {
    nameSchema,
    objectIdSchema,
    optionalUrlSchema,
} from '@/validation/schemas/common';

// Webhook channel parameters validation
export const webhookChannelParamsSchema = z.object({
    serverId: objectIdSchema,
    channelId: objectIdSchema,
});

// Webhook ID parameter validation
export const webhookIdParamSchema = z.object({
    serverId: objectIdSchema,
    channelId: objectIdSchema,
    webhookId: objectIdSchema,
});

// Create webhook validation
export const createWebhookSchema = z.object({
    name: z
        .string()
        .min(1, 'Webhook name is required')
        .max(100, 'Webhook name must be 100 characters or less')
        .trim(),
    avatarUrl: optionalUrlSchema,
});

// Update webhook validation
export const updateWebhookSchema = z.object({
    name: nameSchema.optional(),
    avatar: optionalUrlSchema,
});

// Execute webhook validation (for POST /:token)
export const executeWebhookSchema = z.object({
    content: z
        .string()
        .min(1, 'Message content is required')
        .max(5000, 'Message content must be 5000 characters or less')
        .trim(),
    username: z.string().max(100).optional(),
    avatarUrl: z.string().url().optional(),
});

// Webhook token parameter validation
export const webhookTokenParamSchema = z.object({
    token: z.string().regex(/^[a-f0-9]{128}$/i, 'Invalid webhook token format'),
});

export type CreateWebhookRequest = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookRequest = z.infer<typeof updateWebhookSchema>;
export type ExecuteWebhookRequest = z.infer<typeof executeWebhookSchema>;
