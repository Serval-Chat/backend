import type { WsEvent } from '@/ws/protocol/event';

// ============================================================================
// Direct Message Events
// ============================================================================

/**
 * Client → Server
 * Send a direct message to another user.
 */
export interface ISendMessageDmEvent
    extends WsEvent<
        'send_message_dm',
        {
            receiverId: string; // User ID (ObjectId as string)
            text: string; // Message content (max 2000 chars)
            replyToId?: string; // Optional: Message ID being replied to
        }
    > {}

/**
 * Server → Client (Response to send_message_dm)
 * Confirms message was sent and saved.
 */
export interface IMessageDmSentEvent
    extends WsEvent<
        'message_dm_sent',
        {
            messageId: string;
            senderId: string;
            receiverId: string;
            text: string;
            createdAt: string; // ISO 8601 timestamp
            replyToId?: string;
            repliedTo?: {
                messageId: string;
                senderId: string;
                text: string;
            };
        }
    > {}

export interface IMessageDm {
    messageId: string;
    senderId: string;
    senderUsername: string;
    receiverId: string;
    receiverUsername: string;
    text: string;
    createdAt: string;
    replyToId?: string;
    repliedTo?: {
        messageId: string;
        senderId: string;
        senderUsername: string;
        text: string;
    };
    isEdited: boolean;
}

/**
 * Server → Client (Broadcast)
 * New DM received or sent (broadcast to both sender and receiver sessions).
 */
export interface IMessageDmEvent extends WsEvent<'message_dm', IMessageDm> {}

/**
 * Client → Server
 * Edit an existing direct message.
 */
export interface IEditMessageDmEvent
    extends WsEvent<
        'edit_message_dm',
        {
            messageId: string;
            text: string;
        }
    > {}

/**
 * Server → Client (Broadcast)
 * DM was edited.
 */
export interface IMessageDmEditedEvent
    extends WsEvent<
        'message_dm_edited',
        {
            messageId: string;
            text: string;
            editedAt: string;
            isEdited: true;
        }
    > {}

/**
 * Client → Server
 * Delete a direct message.
 */
export interface IDeleteMessageDmEvent
    extends WsEvent<
        'delete_message_dm',
        {
            messageId: string;
        }
    > {}

/**
 * Server → Client (Broadcast)
 * DM was deleted.
 */
export interface IMessageDmDeletedEvent
    extends WsEvent<
        'message_dm_deleted',
        {
            messageId: string;
        }
    > {}

/**
 * Client → Server
 * Mark a DM conversation as read.
 */
export interface IMarkDmReadEvent
    extends WsEvent<
        'mark_dm_read',
        {
            peerId: string; // User ID of conversation partner
        }
    > {}

/**
 * Server → Client (Broadcast to user's sessions)
 * Unread count for a DM conversation updated.
 */
export interface IDmUnreadUpdatedEvent
    extends WsEvent<
        'dm_unread_updated',
        {
            peerId: string;
            peerUsername: string;
            count: number; // New unread count
        }
    > {}

/**
 * Client → Server
 * Indicate typing in a DM conversation.
 */
export interface ITypingDmEvent
    extends WsEvent<
        'typing_dm',
        {
            receiverId: string;
        }
    > {}

/**
 * Server → Client (Broadcast to receiver)
 * User is typing in DM.
 */
export interface ITypingDmBroadcastEvent
    extends WsEvent<
        'typing_dm',
        {
            senderId: string;
            senderUsername: string;
        }
    > {}

// ============================================================================
// Server (Guild/Channel) Message Events
// ============================================================================

/**
 * Client → Server
 * Subscribe to server-wide events.
 */
export interface IJoinServerEvent
    extends WsEvent<
        'join_server',
        {
            serverId: string;
        }
    > {}

/**
 * Server → Client (Response)
 * Successfully joined server.
 */
export interface IServerJoinedEvent
    extends WsEvent<
        'server_joined',
        {
            serverId: string;
        }
    > {}

/**
 * Client → Server
 * Unsubscribe from server events.
 */
export interface ILeaveServerEvent
    extends WsEvent<
        'leave_server',
        {
            serverId: string;
        }
    > {}

/**
 * Client → Server
 * Subscribe to channel-specific events.
 */
export interface IJoinChannelEvent
    extends WsEvent<
        'join_channel',
        {
            serverId: string;
            channelId: string;
        }
    > {}

/**
 * Server → Client (Response)
 * Successfully joined channel.
 */
export interface IChannelJoinedEvent
    extends WsEvent<
        'channel_joined',
        {
            serverId: string;
            channelId: string;
        }
    > {}

/**
 * Client → Server
 * Unsubscribe from channel events.
 */
export interface ILeaveChannelEvent
    extends WsEvent<
        'leave_channel',
        {
            channelId: string;
        }
    > {}

/**
 * Client → Server
 * Send a message to a server channel.
 */
export interface ISendMessageServerEvent
    extends WsEvent<
        'send_message_server',
        {
            serverId: string;
            channelId: string;
            text: string;
            replyToId?: string;
        }
    > {}

/**
 * Server → Client (Response)
 * Confirms server message was sent.
 */
export interface IMessageServerSentEvent
    extends WsEvent<
        'message_server_sent',
        {
            messageId: string;
            serverId: string;
            channelId: string;
            senderId: string;
            text: string;
            createdAt: string;
        }
    > {}

export interface IMessageServer {
    messageId: string;
    serverId: string;
    channelId: string;
    senderId: string;
    senderUsername: string;
    text: string;
    createdAt: string;
    replyToId?: string;
    repliedTo?: {
        messageId: string;
        senderId: string;
        senderUsername: string;
        text: string;
    };
    isEdited: boolean;
    isWebhook: boolean;
    webhookUsername?: string;
    webhookAvatarUrl?: string;
}

/**
 * Server → Client (Broadcast to channel)
 * New server message.
 */
export interface IMessageServerEvent
    extends WsEvent<'message_server', IMessageServer> {}

/**
 * Client → Server
 * Edit a server message.
 */
export interface IEditMessageServerEvent
    extends WsEvent<
        'edit_message_server',
        {
            messageId: string;
            text: string;
        }
    > {}

/**
 * Server → Client (Broadcast)
 * Server message was edited.
 */
export interface IMessageServerEditedEvent
    extends WsEvent<
        'message_server_edited',
        {
            messageId: string;
            serverId: string;
            channelId: string;
            text: string;
            editedAt: string;
            isEdited: true;
        }
    > {}

/**
 * Client → Server
 * Delete a server message.
 */
export interface IDeleteMessageServerEvent
    extends WsEvent<
        'delete_message_server',
        {
            serverId: string;
            messageId: string;
        }
    > {}

/**
 * Server → Client (Broadcast)
 * Server message was deleted.
 */
export interface IMessageServerDeletedEvent
    extends WsEvent<
        'message_server_deleted',
        {
            messageId: string;
            channelId: string;
        }
    > {}

/**
 * Client → Server
 * Mark a channel as read.
 */
export interface IMarkChannelReadEvent
    extends WsEvent<
        'mark_channel_read',
        {
            serverId: string;
            channelId: string;
        }
    > {}

/**
 * Server → Client (Broadcast to user's sessions)
 * Channel unread status updated.
 */
export interface IChannelUnreadUpdatedEvent
    extends WsEvent<
        'channel_unread_updated',
        {
            serverId: string;
            channelId: string;
            lastMessageAt: string | null;
            senderId: string;
            lastReadAt?: string;
        }
    > {}

/**
 * Client → Server
 * Indicate typing in a channel.
 */
export interface ITypingServerEvent
    extends WsEvent<
        'typing_server',
        {
            serverId: string;
            channelId: string;
        }
    > {}

/**
 * Server → Client (Broadcast to channel)
 * User is typing in channel.
 */
export interface ITypingServerBroadcastEvent
    extends WsEvent<
        'typing_server',
        {
            channelId: string;
            senderId: string;
            senderUsername: string;
        }
    > {}
