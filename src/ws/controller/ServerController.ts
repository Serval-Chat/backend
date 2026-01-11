import { injectable, inject } from 'inversify';
import {
    WsController,
    Event,
    NeedAuth,
    Validate,
    RateLimit,
    Dedup,
} from '@/ws/decorators';
import {
    JoinServerSchema,
    LeaveServerSchema,
    JoinChannelSchema,
    LeaveChannelSchema,
    SendMessageServerSchema,
    EditMessageServerSchema,
    DeleteMessageServerSchema,
    MarkChannelReadSchema,
    TypingServerSchema,
} from '@/validation/schemas/ws/messages.schema';
import type {
    IJoinServerEvent,
    IServerJoinedEvent,
    ILeaveServerEvent,
    IJoinChannelEvent,
    IChannelJoinedEvent,
    ILeaveChannelEvent,
    ISendMessageServerEvent,
    IMessageServerSentEvent,
    IMessageServerEvent,
    IEditMessageServerEvent,
    IMessageServerEditedEvent,
    IDeleteMessageServerEvent,
    IMarkChannelReadEvent,
    IChannelUnreadUpdatedEvent,
    ITypingServerEvent,
    ITypingServerBroadcastEvent,
    IMessageServer,
} from '@/ws/protocol/events/messages';
import type { IMentionEvent } from '@/ws/protocol/events/mentions';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IServerMessageRepository } from '@/di/interfaces/IServerMessageRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { IServerChannelReadRepository } from '@/di/interfaces/IServerChannelReadRepository';
import type { IRoleRepository } from '@/di/interfaces/IRoleRepository';
import type { PermissionService } from '@/services/PermissionService';
import type { PingService } from '@/services/PingService';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import type { IWsUser } from '@/ws/types';
import type { WebSocket } from 'ws';
import { Types } from 'mongoose';
import logger from '@/utils/logger';
import type { TransactionManager } from '@/infrastructure/TransactionManager';

/**
 * Controller for handling server/channel message events.
 */
@injectable()
@WsController()
export class ServerController {
    @inject(TYPES.WsServer) private wsServer!: IWsServer;

    constructor(
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @inject(TYPES.ServerChannelReadRepository)
        private serverChannelReadRepo: IServerChannelReadRepository,
        @inject(TYPES.RoleRepository) private roleRepo: IRoleRepository,
        @inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.PingService) private pingService: PingService,
        @inject(TYPES.TransactionManager)
        private transactionManager: TransactionManager,
    ) {}

    /**
     * Handles 'join_server' event.
     * Subscribes the socket to server-wide events.
     */
    @Event('join_server')
    @NeedAuth()
    @Validate(JoinServerSchema)
    public async onJoinServer(
        payload: IJoinServerEvent['payload'],
        authenticatedUser?: IWsUser,
        ws?: WebSocket,
    ): Promise<IServerJoinedEvent['payload']> {
        if (!authenticatedUser || !ws) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const { serverId } = payload;
        const userId = authenticatedUser.userId;

        // Verify membership
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new Error('FORBIDDEN: Not a member of this server');
        }

        // Subscribe to server events
        this.wsServer.subscribeToServer(ws, serverId);
        logger.debug(
            `[ServerController] User ${userId} joined server ${serverId}`,
        );

        return { serverId };
    }

    /**
     * Handles 'leave_server' event.
     * Unsubscribes from server events.
     */
    @Event('leave_server')
    @NeedAuth()
    @Validate(LeaveServerSchema)
    public async onLeaveServer(
        payload: ILeaveServerEvent['payload'],
        authenticatedUser?: IWsUser,
        ws?: WebSocket,
    ): Promise<void> {
        if (!authenticatedUser || !ws) {
            return;
        }

        const { serverId } = payload;
        this.wsServer.unsubscribeFromServer(ws, serverId);
        logger.debug(
            `[ServerController] User ${authenticatedUser.userId} left server ${serverId}`,
        );
    }

    /**
     * Handles 'join_channel' event.
     * Subscribes to channel-specific events
     */
    @Event('join_channel')
    @NeedAuth()
    @Validate(JoinChannelSchema)
    public async onJoinChannel(
        payload: IJoinChannelEvent['payload'],
        authenticatedUser?: IWsUser,
        ws?: WebSocket,
    ): Promise<IChannelJoinedEvent['payload']> {
        if (!authenticatedUser || !ws) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const { serverId, channelId } = payload;
        const userId = authenticatedUser.userId;

        // Verify server membership
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new Error('FORBIDDEN: Not a member of this server');
        }

        // Subscribe to channel
        this.wsServer.subscribeToChannel(ws, channelId);
        logger.debug(
            `[ServerController] User ${userId} joined channel ${channelId}`,
        );

        return { serverId, channelId };
    }

    /**
     * Handles 'leave_channel' event.
     * Unsubscribes from channel events.
     */
    @Event('leave_channel')
    @NeedAuth()
    @Validate(LeaveChannelSchema)
    public async onLeaveChannel(
        payload: ILeaveChannelEvent['payload'],
        authenticatedUser?: IWsUser,
        ws?: WebSocket,
    ): Promise<void> {
        if (!authenticatedUser || !ws) {
            return;
        }

        const { channelId } = payload;
        this.wsServer.unsubscribeFromChannel(ws, channelId);
        logger.debug(
            `[ServerController] User ${authenticatedUser.userId} left channel ${channelId}`,
        );
    }

    /**
     * Handles 'send_message_server' event.
     */
    @Event('send_message_server')
    @NeedAuth()
    @Validate(SendMessageServerSchema)
    @RateLimit(10, 1000) // 10 messages per second
    @Dedup()
    public async onSendMessageServer(
        payload: ISendMessageServerEvent['payload'],
        authenticatedUser?: IWsUser,
        ws?: WebSocket,
    ): Promise<IMessageServerSentEvent['payload']> {
        if (!authenticatedUser) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const { serverId, channelId, text, replyToId } = payload;
        const userId = authenticatedUser.userId;

        // Verify membership
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new Error('FORBIDDEN: Not a member of this server');
        }

        // Check sendMessages permission
        const canSend = await this.permissionService.hasChannelPermission(
            serverId,
            userId,
            channelId,
            'sendMessages',
        );
        if (!canSend) {
            throw new Error(
                'FORBIDDEN: No permission to send messages in this channel',
            );
        }

        // Parse mentions
        const {
            userIds: mentionedUserIds,
            roleIds: mentionedRoleIds,
            everyone: mentionedEveryone,
        } = this.parseMentions(text);

        // Check permission for @everyone
        if (mentionedEveryone) {
            const canPingEveryone = await this.permissionService.hasPermission(
                serverId,
                userId,
                'pingRolesAndEveryone',
            );
            if (!canPingEveryone) {
                throw new Error('FORBIDDEN: No permission to ping @everyone');
            }
        }

        // Check permission for @role
        if (mentionedRoleIds.length > 0) {
            const canPingRoles = await this.permissionService.hasPermission(
                serverId,
                userId,
                'pingRolesAndEveryone',
            );
            if (!canPingRoles) {
                throw new Error('FORBIDDEN: No permission to ping roles');
            }
        }

        const created = await this.transactionManager.runInTransaction(
            async (session) => {
                const msg = await this.serverMessageRepo.create(
                    {
                        serverId,
                        channelId,
                        senderId: userId,
                        text,
                        ...(replyToId ? { replyToId } : {}),
                    },
                    session,
                );

                logger.info(
                    `[ServerController] Server message sent in channel ${channelId} by ${userId}`,
                );

                await this.channelRepo.updateLastMessageAt(
                    channelId,
                    undefined,
                    session,
                );
                await this.serverChannelReadRepo.upsert(
                    serverId,
                    channelId,
                    userId,
                    session,
                );

                return msg;
            },
        );

        const broadcastPayload: IMessageServerEvent['payload'] = {
            messageId: created._id.toString(),
            serverId,
            channelId,
            senderId: userId,
            senderUsername: authenticatedUser.username,
            text: created.text,
            createdAt:
                created.createdAt?.toISOString() || new Date().toISOString(),
            replyToId: created.replyToId?.toString(),
            repliedTo: undefined,
            isEdited: false,
            isWebhook: false,
        };

        this.wsServer.broadcastToChannel(
            channelId,
            {
                type: 'message_server',
                payload: broadcastPayload,
            },
            undefined,
            ws,
        );

        this.handleMentions(
            serverId,
            channelId,
            userId,
            authenticatedUser.username,
            mentionedUserIds,
            mentionedRoleIds,
            mentionedEveryone,
            broadcastPayload,
        ).catch((err) =>
            logger.error(
                `[ServerController] Failed to handle mentions: ${err.message}`,
            ),
        );

        await this.wsServer.broadcastToServerWithPermission(
            serverId,
            {
                type: 'channel_unread_updated',
                payload: {
                    serverId,
                    channelId,
                    lastMessageAt:
                        created.createdAt?.toISOString() ||
                        new Date().toISOString(),
                    senderId: userId,
                },
            },
            async (targetUserId) => {
                return this.permissionService.hasChannelPermission(
                    serverId,
                    targetUserId,
                    channelId,
                    'viewChannel',
                );
            },
            undefined,
            ws,
        );

        return {
            messageId: created._id.toString(),
            serverId,
            channelId,
            senderId: userId,
            text: created.text,
            createdAt:
                created.createdAt?.toISOString() || new Date().toISOString(),
        };
    }

    /**
     * Handles 'edit_message_server' event.
     * Edits an existing server message.
     */
    @Event('edit_message_server')
    @NeedAuth()
    @Validate(EditMessageServerSchema)
    public async onEditMessageServer(
        payload: IEditMessageServerEvent['payload'],
        authenticatedUser?: IWsUser,
        ws?: WebSocket,
    ): Promise<IMessageServerEditedEvent['payload']> {
        if (!authenticatedUser) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const { messageId, text } = payload;
        const userId = authenticatedUser.userId;

        // Find message
        const message = await this.serverMessageRepo.findById(messageId);
        if (!message) {
            throw new Error('NOT_FOUND: Message not found');
        }

        // Validate ownership
        if (message.senderId.toString() !== userId) {
            throw new Error('FORBIDDEN: Can only edit your own messages');
        }

        // Update message
        const updated = await this.serverMessageRepo.update(messageId, {
            text,
            editedAt: new Date(),
            isEdited: true,
        });
        if (!updated) {
            throw new Error('INTERNAL_ERROR: Failed to update message');
        }

        logger.info(
            `[ServerController] Server message ${messageId} edited by ${userId}`,
        );

        // Broadcast to channel
        const broadcastPayload: IMessageServerEditedEvent['payload'] = {
            messageId,
            serverId: message.serverId.toString(),
            channelId: message.channelId.toString(),
            text: updated.text,
            editedAt:
                updated.editedAt?.toISOString() || new Date().toISOString(),
            isEdited: true,
        };

        this.wsServer.broadcastToChannel(
            message.channelId.toString(),
            {
                type: 'message_server_edited',
                payload: broadcastPayload,
            },
            undefined,
            ws,
        );

        return broadcastPayload;
    }

    /**
     * Handles 'delete_message_server' event.
     * Deletes a server message.
     */
    @Event('delete_message_server')
    @NeedAuth()
    @Validate(DeleteMessageServerSchema)
    public async onDeleteMessageServer(
        payload: IDeleteMessageServerEvent['payload'],
        authenticatedUser?: IWsUser,
        ws?: WebSocket,
    ): Promise<{ success: boolean }> {
        if (!authenticatedUser) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const { serverId, messageId } = payload;
        const userId = authenticatedUser.userId;

        // Find message
        const message = await this.serverMessageRepo.findById(messageId);
        if (!message) {
            throw new Error('NOT_FOUND: Message not found');
        }

        // Check if user can delete (author OR has manageMessages permission)
        const isAuthor = message.senderId.toString() === userId;
        const hasPermission = await this.permissionService.hasPermission(
            serverId,
            userId,
            'manageMessages',
        );

        if (!isAuthor && !hasPermission) {
            throw new Error('FORBIDDEN: No permission to delete this message');
        }

        // Delete message
        await this.serverMessageRepo.delete(messageId);

        logger.info(
            `[ServerController] Server message ${messageId} deleted by ${userId}`,
        );

        // Broadcast to channel
        this.wsServer.broadcastToChannel(
            message.channelId.toString(),
            {
                type: 'message_server_deleted',
                payload: {
                    messageId,
                    channelId: message.channelId.toString(),
                },
            },
            undefined,
            ws,
        );

        return { success: true };
    }

    /**
     * Handles 'mark_channel_read' event.
     * Marks a channel as read for the user.
     */
    @Event('mark_channel_read')
    @NeedAuth()
    @Validate(MarkChannelReadSchema)
    public async onMarkChannelRead(
        payload: IMarkChannelReadEvent['payload'],
        authenticatedUser?: IWsUser,
    ): Promise<{ success: boolean }> {
        if (!authenticatedUser) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const { serverId, channelId } = payload;
        const userId = authenticatedUser.userId;

        // Verify membership
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new Error('FORBIDDEN: Not a member of this server');
        }

        // Update read state
        const updatedRead = await this.serverChannelReadRepo.upsert(
            serverId,
            channelId,
            userId,
        );

        logger.debug(
            `[ServerController] User ${userId} marked channel ${channelId} as read`,
        );

        // Broadcast to user's sessions
        const unreadPayload: IChannelUnreadUpdatedEvent['payload'] = {
            serverId,
            channelId,
            lastMessageAt: null,
            senderId: userId,
            lastReadAt: updatedRead?.lastReadAt?.toISOString(),
        };

        this.wsServer.broadcastToUser(userId, {
            type: 'channel_unread_updated',
            payload: unreadPayload,
        });

        return { success: true };
    }

    /**
     * Handles 'typing_server' event.
     * Broadcasts typing indicator to the channel.
     */
    @Event('typing_server')
    @NeedAuth()
    @Validate(TypingServerSchema)
    @RateLimit(100, 1000) // 100 typing events per second
    public async onTypingServer(
        payload: ITypingServerEvent['payload'],
        authenticatedUser?: IWsUser,
    ): Promise<void> {
        if (!authenticatedUser) {
            return;
        }

        const { serverId, channelId } = payload;
        const userId = authenticatedUser.userId;

        // Check sendMessages permission
        const canSend = await this.permissionService.hasChannelPermission(
            serverId,
            userId,
            channelId,
            'sendMessages',
        );
        if (!canSend) {
            return; // Silently ignore
        }

        // Broadcast typing to channel
        const typingPayload: ITypingServerBroadcastEvent['payload'] = {
            channelId,
            senderId: userId,
            senderUsername: authenticatedUser.username,
        };

        this.wsServer.broadcastToChannel(channelId, {
            type: 'typing_server',
            payload: typingPayload,
        });
    }

    // ========================================================================
    // Helper Methods
    // ========================================================================

    /**
     * Parses mentions from message text.
     * Format: <userid:'userId'>, <roleid:'roleId'>, <everyone>
     */
    private parseMentions(text: string): {
        userIds: string[];
        roleIds: string[];
        everyone: boolean;
    } {
        const userIds: string[] = [];
        const roleIds: string[] = [];
        let everyone = false;

        const MAX_USER_MENTIONS = 50;
        const MAX_ROLE_MENTIONS = 10;

        // Parse user mentions: <userid:'userId'>
        const userMentionRegex = /<userid:'([^']+)'>/g;
        let match;
        while ((match = userMentionRegex.exec(text)) !== null) {
            if (match[1]) {
                if (Types.ObjectId.isValid(match[1])) {
                    userIds.push(match[1]);
                    if (userIds.length >= MAX_USER_MENTIONS) {
                        break;
                    }
                }
            }
        }

        // Parse role mentions: <roleid:'roleId'>
        const roleMentionRegex = /<roleid:'([^']+)'>/g;
        while ((match = roleMentionRegex.exec(text)) !== null) {
            if (match[1]) {
                if (Types.ObjectId.isValid(match[1])) {
                    roleIds.push(match[1]);
                    if (roleIds.length >= MAX_ROLE_MENTIONS) {
                        break;
                    }
                }
            }
        }

        // Parse @everyone mention: <everyone>
        const everyoneRegex = /<everyone>/g;
        if (everyoneRegex.test(text)) {
            everyone = true;
        }

        return { userIds, roleIds, everyone };
    }

    /**
     * Handles mention notifications.
     * Resolves role members, stores pings, and broadcasts to online users.
     */
    private async handleMentions(
        serverId: string,
        channelId: string,
        senderId: string,
        senderUsername: string,
        mentionedUserIds: string[],
        mentionedRoleIds: string[],
        mentionedEveryone: boolean,
        message: IMessageServer,
    ): Promise<void> {
        const allMentionedUserIds = new Set<string>();

        // Add direct user mentions
        for (const userId of mentionedUserIds) {
            if (userId !== senderId) {
                allMentionedUserIds.add(userId);
            }
        }

        // Resolve role members
        if (mentionedRoleIds.length > 0) {
            const allMembers =
                await this.serverMemberRepo.findByServerId(serverId);
            for (const roleId of mentionedRoleIds) {
                const membersWithRole = allMembers.filter((m) =>
                    m.roles.some((r) => r.toString() === roleId),
                );
                membersWithRole.forEach((m) => {
                    if (m.userId.toString() !== senderId) {
                        allMentionedUserIds.add(m.userId.toString());
                    }
                });
            }
        }

        // Resolve @everyone members
        if (mentionedEveryone) {
            const allMembers =
                await this.serverMemberRepo.findByServerId(serverId);
            allMembers.forEach((m) => {
                if (m.userId.toString() !== senderId) {
                    allMentionedUserIds.add(m.userId.toString());
                }
            });
        }

        // Send ping notifications to mentioned users
        for (const mentionedUserId of allMentionedUserIds) {
            const mentionedUser = await this.userRepo.findById(mentionedUserId);
            if (!mentionedUser?.username) continue;

            // Check if mentioned user is a member
            const mentionedMember =
                await this.serverMemberRepo.findByServerAndUser(
                    serverId,
                    mentionedUserId,
                );
            if (!mentionedMember) continue;

            if (!message.messageId) continue;

            // Store ping for ALL users (online and offline)
            const pingData = {
                type: 'mention' as const,
                sender: senderUsername,
                senderId,
                serverId,
                channelId,
                message: {
                    messageId: message.messageId,
                    text: message.text,
                    createdAt: message.createdAt,
                },
            };

            await this.pingService.addPing(mentionedUserId, pingData);

            // Emit socket event only for online users
            if (this.wsServer.isUserOnline(mentionedUserId)) {
                const mentionPayload: IMentionEvent['payload'] = {
                    type: 'mention',
                    sender: senderUsername,
                    senderId,
                    serverId,
                    channelId,
                    message,
                };

                this.wsServer.broadcastToUser(mentionedUserId, {
                    type: 'mention',
                    payload: mentionPayload,
                });
            }
        }
    }
}
