import { z } from 'zod';

/**
 * Schema for joining a server room.
 */
export const JoinServerSchema = z.object({
    serverId: z.string(),
});

/**
 * Schema for leaving a server room.
 */
export const LeaveServerSchema = z.object({
    serverId: z.string(),
});

/**
 * Schema for joining a channel room.
 */
export const JoinChannelSchema = z.object({
    serverId: z.string(),
    channelId: z.string(),
});

/**
 * Schema for leaving a channel room.
 */
export const LeaveChannelSchema = z.object({
    channelId: z.string(),
});

/**
 * Schema for sending a message in a server channel.
 */
export const ServerMessageSchema = z.object({
    serverId: z.string(),
    channelId: z.string(),
    text: z.string().min(1).max(5000),
    replyToId: z.string().optional(),
});

/**
 * Schema for marking a channel as read.
 */
export const MarkChannelReadSchema = z.object({
    serverId: z.string(),
    channelId: z.string(),
});

/**
 * Schema for typing indicators in server channels.
 */
export const ServerTypingSchema = z.object({
    serverId: z.string(),
    channelId: z.string(),
});

/**
 * Schema for editing a server message.
 */
export const EditServerMessageSchema = z.object({
    messageId: z.string(),
    text: z.string().min(1).max(5000),
});

/**
 * Schema for deleting a server message.
 */
export const DeleteServerMessageSchema = z.object({
    serverId: z.string(),
    messageId: z.string(),
});

export const ServerMemberJoinedSchema = z.object({
    serverId: z.string(),
    userId: z.string(),
});

export const ServerMemberLeftSchema = z.object({
    serverId: z.string(),
    userId: z.string(),
});

export const ServerOwnershipTransferredSchema = z.object({
    serverId: z.string(),
    previousOwnerId: z.string(),
    newOwnerId: z.string(),
    newOwnerUsername: z.string(),
    newOwnerProfilePicture: z.string().optional(),
    transferredAt: z.string().or(z.date()), // Accepts ISO string or Date object
});
