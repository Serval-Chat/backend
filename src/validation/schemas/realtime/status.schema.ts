import { z } from 'zod';

// Schema for subscribing to user status updates
export const StatusSubscribeSchema = z.object({
    usernames: z.array(z.string()),
});

// Schema for unsubscribing from user status updates
export const StatusUnsubscribeSchema = z.object({
    usernames: z.array(z.string()).optional(),
});

// Schema for requesting current status of users
export const StatusRequestSchema = z.object({
    usernames: z.array(z.string()),
});
