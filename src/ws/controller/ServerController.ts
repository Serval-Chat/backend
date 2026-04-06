import { injectable, inject, postConstruct } from 'inversify';
import mongoose from 'mongoose';
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
    JoinVoiceSchema,
    LeaveVoiceSchema,
    UpdateVoiceStateSchema,
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
    IServerUnreadUpdatedEvent,
    ITypingServerEvent,
    ITypingServerBroadcastEvent,
    IMessageServer,
    IJoinVoiceEvent,
    ILeaveVoiceEvent,
    IUserJoinedVoiceEvent,
    IUserLeftVoiceEvent,
    IUpdateVoiceStateEvent,
    IVoiceStateUpdatedEvent,
} from '@/ws/protocol/events/messages';
import type { IMentionEvent } from '@/ws/protocol/events/mentions';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IServerMessageRepository } from '@/di/interfaces/IServerMessageRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { IServerChannelReadRepository } from '@/di/interfaces/IServerChannelReadRepository';
import type { IRoleRepository } from '@/di/interfaces/IRoleRepository';
import type { PermissionService } from '@/permissions/PermissionService';
import type { PingService } from '@/services/PingService';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import { ApiError } from '@/utils/ApiError';
import { ErrorMessages } from '@/constants/errorMessages';
import type { IWsEnvelope } from '@/ws/protocol/envelope';
import type { IWsUser } from '@/ws/types';
import type { WebSocket } from 'ws';
import logger from '@/utils/logger';
import type { TransactionManager } from '@/infrastructure/TransactionManager';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import { notifyUser } from '@/services/pushService';

/**
 * Controller for handling server/channel message events.
 */
@injectable()
@WsController()
export class ServerController {
    @inject(TYPES.WsServer) private wsServer!: IWsServer;

    constructor(
        @inject(TYPES.ServerRepository) private serverRepo: IServerRepository,
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
        @inject(TYPES.RedisService) private redisService: IRedisService,
    ) {}

    @postConstruct()
    public setupEventListeners() {
        this.wsServer.on('user:offline', (userId: string) => {
            this.cleanupVoicePresence(userId).catch((err) =>
                logger.error(
                    `[ServerController] Failed to clean up voice presence for ${userId}: ${err}`,
                ),
            );
        });
    }

    private async cleanupVoicePresence(userId: string) {
        const redis = this.redisService.getClient();
        const voiceRoom = await redis.get(`user_voice:${userId}`);
        if (voiceRoom) {
            const parts = voiceRoom.split(':');
            if (parts.length === 2) {
                const [sId, cId] = parts as [string, string];
                if (sId && cId) {
                    await this._internalLeaveVoice(userId, sId, cId);
                }
            } else if (parts.length === 1) {
                const channelId = parts[0] as string;
                try {
                    const channel = await this.channelRepo.findById(
                        new mongoose.Types.ObjectId(channelId),
                    );
                    if (channel) {
                        await this._internalLeaveVoice(
                            userId,
                            channel.serverId.toString(),
                            channelId,
                        );
                    } else {
                        await redis.del(`user_voice:${userId}`);
                        await redis.srem(`voice_channel:${channelId}`, userId);
                    }
                } catch (err) {
                    await redis.del(`user_voice:${userId}`);
                }
            }
        }
    }

    private async _internalLeaveVoice(
        userId: string,
        serverId: string,
        channelId: string,
    ) {
        const redis = this.redisService.getClient();

        // Use both scoped and legacy keys for robust cleanup during transition
        const scopedVoiceKey = `voice_channel:${serverId}:${channelId}`;
        const legacyVoiceKey = `voice_channel:${channelId}`;
        const scopedHkey = `voice_states:${serverId}:${channelId}`;
        const legacyHkey = `voice_states:${channelId}`;

        await Promise.all([
            redis.srem(scopedVoiceKey, userId),
            redis.srem(legacyVoiceKey, userId),
            redis.hdel(scopedHkey, userId),
            redis.hdel(legacyHkey, userId),
            redis.del(`user_voice:${userId}`),
        ]);

        // Broadcast to server
        this.wsServer.broadcastToServer(serverId, {
            type: 'user_left_voice',
            payload: { serverId, channelId, userId },
        });

        // Cleanup empty keys
        const [remScoped, remLegacy] = await Promise.all([
            redis.scard(scopedVoiceKey),
            redis.scard(legacyVoiceKey),
        ]);

        if (remScoped === 0) await redis.del(scopedVoiceKey);
        if (remLegacy === 0) await redis.del(legacyVoiceKey);

        const [remHScoped, remHLegacy] = await Promise.all([
            redis.hlen(scopedHkey),
            redis.hlen(legacyHkey),
        ]);

        if (remHScoped === 0) await redis.del(scopedHkey);
        if (remHLegacy === 0) await redis.del(legacyHkey);

        logger.debug(
            `[ServerController] User ${userId} left voice channel ${channelId} (Server: ${serverId})`,
        );
    }

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

        // Verify membership or ownership
        const serverOid = new mongoose.Types.ObjectId(serverId);
        const userOid = new mongoose.Types.ObjectId(userId);

        const [member, server] = await Promise.all([
            this.serverMemberRepo.findByServerAndUser(serverOid, userOid),
            this.serverRepo.findById(serverOid),
        ]);

        const isOwner = server?.ownerId && server.ownerId.toString() === userId;

        if (!member && !isOwner) {
            throw new Error('FORBIDDEN: Not a member of this server');
        }

        // Subscribe to server events
        this.wsServer.subscribeToServer(ws, serverId);
        logger.debug(
            `[ServerController] User ${userId} joined server ${serverId}`,
        );

        const redisClient = this.redisService.getClient();
        let cursor = '0';
        const scanMatch = `voice_channel:${serverId}:*`;
        const voiceStates: Record<string, string[]> = {};

        try {
            do {
                const [nextCursor, keys] = await redisClient.scan(
                    cursor,
                    'MATCH',
                    scanMatch,
                    'COUNT',
                    100,
                );
                cursor = nextCursor;

                for (const key of keys) {
                    const parts = key.split(':');
                    if (parts.length === 3) {
                        const [, , channelId] = parts;
                        const members = await redisClient.smembers(key);
                        if (members.length > 0 && channelId) {
                            voiceStates[channelId] = members;
                        }
                    }
                }
            } while (cursor !== '0');
        } catch (error) {
            logger.error(
                '[ServerController] Failed to fetch voice states for join_server:',
                error,
            );
        }

        return { serverId, voiceStates };
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
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
        );
        if (!member) {
            throw new Error('FORBIDDEN: Not a member of this server');
        }

        // Subscribe to channel
        const channel = await this.channelRepo.findById(
            new mongoose.Types.ObjectId(channelId),
        );
        if (channel?.type === 'link') {
            throw new Error('FORBIDDEN: Cannot join a link channel');
        }

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

    @Event('join_voice')
    @NeedAuth()
    @Validate(JoinVoiceSchema)
    public async onJoinVoice(
        payload: IJoinVoiceEvent['payload'],
        authenticatedUser?: IWsUser,
    ): Promise<IJoinVoiceEvent['response']> {
        if (!authenticatedUser) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const { serverId, channelId } = payload;
        const userId = authenticatedUser.userId;

        // Verify membership
        const member = await this.serverMemberRepo.findByServerAndUser(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
        );
        if (!member) {
            throw new Error('FORBIDDEN: Not a member of this server');
        }

        const [hasView, hasConnect] = await Promise.all([
            this.permissionService.hasChannelPermission(
                new mongoose.Types.ObjectId(serverId),
                new mongoose.Types.ObjectId(userId),
                new mongoose.Types.ObjectId(channelId),
                'viewChannels',
            ),
            this.permissionService.hasChannelPermission(
                new mongoose.Types.ObjectId(serverId),
                new mongoose.Types.ObjectId(userId),
                new mongoose.Types.ObjectId(channelId),
                'connect',
            ),
        ]);

        if (!hasView || !hasConnect) {
            throw new ApiError(
                403,
                'FORBIDDEN: No permission to join this voice channel',
            );
        }

        const redis = this.redisService.getClient();
        const ttl = 86400; // 24 hours

        const voiceKey = `voice_channel:${serverId}:${channelId}`;
        const userVoiceKey = `user_voice:${userId}`;

        // Ensure user leaves any previous voice channel before joining a new one
        const existingVoiceRoom = await redis.get(userVoiceKey);
        if (
            existingVoiceRoom &&
            existingVoiceRoom !== `${serverId}:${channelId}`
        ) {
            const [oldServerId, oldChannelId] = existingVoiceRoom.split(':');
            if (oldServerId && oldChannelId) {
                await this._internalLeaveVoice(
                    userId,
                    oldServerId,
                    oldChannelId,
                );
            }
        }

        await redis.sadd(voiceKey, userId);
        await redis.expire(voiceKey, ttl);

        await redis.set(userVoiceKey, `${serverId}:${channelId}`, 'EX', ttl);

        logger.debug(
            `[ServerController] User ${userId} joined voice ${channelId}`,
        );

        const broadcastPayload: IUserJoinedVoiceEvent['payload'] = {
            serverId,
            channelId,
            userId,
        };

        this.wsServer.broadcastToServer(serverId, {
            type: 'user_joined_voice',
            payload: broadcastPayload,
        });

        const hkey = `voice_states:${serverId}:${channelId}`;
        const participants = await redis.smembers(voiceKey);
        const voiceStates = await redis.hgetall(hkey);
        const parsedStates: Record<
            string,
            { isMuted: boolean; isDeafened: boolean }
        > = {};
        for (const [uid, state] of Object.entries(voiceStates)) {
            try {
                parsedStates[uid] = JSON.parse(state);
            } catch (err) {
                logger.error(
                    `[ServerController] Failed to parse voice state for ${uid}: ${err}`,
                );
            }
        }

        return {
            success: true,
            serverId,
            channelId,
            participants,
            voiceStates: parsedStates,
        };
    }

    /**
     * Handles 'leave_voice' event.
     * Stops tracking user in a voice channel globally.
     */
    @Event('leave_voice')
    @NeedAuth()
    @Validate(LeaveVoiceSchema)
    public async onLeaveVoice(
        payload: ILeaveVoiceEvent['payload'],
        authenticatedUser?: IWsUser,
    ): Promise<{ success: boolean }> {
        if (!authenticatedUser) {
            return { success: false };
        }

        const { serverId, channelId } = payload;
        const userId = authenticatedUser.userId;

        await this._internalLeaveVoice(userId, serverId, channelId);

        return { success: true };
    }

    @Event('update_voice_state')
    @NeedAuth()
    @Validate(UpdateVoiceStateSchema)
    public async onUpdateVoiceState(
        payload: IUpdateVoiceStateEvent['payload'],
        authenticatedUser?: IWsUser,
    ): Promise<{ success: boolean }> {
        if (!authenticatedUser) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const { serverId, channelId, isMuted, isDeafened } = payload;
        const userId = authenticatedUser.userId;

        const redis = this.redisService.getClient();
        const hkey = `voice_states:${serverId}:${channelId}`;
        const ttl = 86400; // 24 hours

        await redis.hset(hkey, userId, JSON.stringify({ isMuted, isDeafened }));
        await redis.expire(hkey, ttl);

        const broadcastPayload: IVoiceStateUpdatedEvent['payload'] = {
            serverId,
            channelId,
            userId,
            isMuted,
            isDeafened,
        };

        this.wsServer.broadcastToServer(serverId, {
            type: 'voice_state_updated',
            payload: broadcastPayload,
        });

        return { success: true };
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
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
        );
        if (!member) {
            throw new Error('FORBIDDEN: Not a member of this server');
        }

        // Check sendMessages permission
        const channel = await this.channelRepo.findById(
            new mongoose.Types.ObjectId(channelId),
        );
        if (channel?.type === 'link') {
            throw new Error(
                'FORBIDDEN: Cannot send messages to a link channel',
            );
        }

        const canSend = await this.permissionService.hasChannelPermission(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
            new mongoose.Types.ObjectId(channelId),
            'sendMessages',
        );
        if (!canSend) {
            throw new Error(
                'FORBIDDEN: No permission to send messages in this channel',
            );
        }

        // Slow Mode Check
        if (channel?.slowMode && channel.slowMode > 0) {
            const hasBypass = await this.permissionService.hasChannelPermission(
                new mongoose.Types.ObjectId(serverId),
                new mongoose.Types.ObjectId(userId),
                new mongoose.Types.ObjectId(channelId),
                'bypassSlowmode',
            );

            if (!hasBypass) {
                const lastMessage =
                    await this.serverMessageRepo.findLastByChannelAndUser(
                        new mongoose.Types.ObjectId(channelId),
                        new mongoose.Types.ObjectId(userId),
                    );

                if (lastMessage && lastMessage.createdAt) {
                    const cooldownMs = channel.slowMode * 1000;
                    const timeSinceLastMessage =
                        Date.now() - lastMessage.createdAt.getTime();

                    if (timeSinceLastMessage < cooldownMs) {
                        const remainingSeconds = Math.ceil(
                            (cooldownMs - timeSinceLastMessage) / 1000,
                        );
                        const message = ErrorMessages.MESSAGE.SLOW_MODE.replace(
                            '%s',
                            `${remainingSeconds}s`,
                        );
                        throw new ApiError(403, message);
                    }
                }
            }
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
                new mongoose.Types.ObjectId(serverId),
                new mongoose.Types.ObjectId(userId),
                'pingRolesAndEveryone',
            );
            if (!canPingEveryone) {
                throw new Error('FORBIDDEN: No permission to ping @everyone');
            }
        }

        // Check permission for @role
        if (mentionedRoleIds.length > 0) {
            const canPingRoles = await this.permissionService.hasPermission(
                new mongoose.Types.ObjectId(serverId),
                new mongoose.Types.ObjectId(userId),
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
                        serverId: new mongoose.Types.ObjectId(serverId),
                        channelId: new mongoose.Types.ObjectId(channelId),
                        senderId: new mongoose.Types.ObjectId(userId),
                        text,
                        ...(replyToId
                            ? {
                                  replyToId: new mongoose.Types.ObjectId(
                                      replyToId,
                                  ),
                              }
                            : {}),
                    },
                    session,
                );

                logger.info(
                    `[ServerController] Server message sent in channel ${channelId} by ${userId}`,
                );

                await this.channelRepo.updateLastMessageAt(
                    new mongoose.Types.ObjectId(channelId),
                    undefined,
                    session,
                );
                await this.serverChannelReadRepo.upsert(
                    new mongoose.Types.ObjectId(serverId),
                    new mongoose.Types.ObjectId(channelId),
                    new mongoose.Types.ObjectId(userId),
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
            isPinned: false,
            isSticky: false,
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
            {
                type: 'channel',
                targetId: channelId,
                permission: 'viewChannels',
            },
            undefined,
            ws,
        );

        // Notify all server members with view permission
        const members = await this.serverMemberRepo.findByServerId(
            new mongoose.Types.ObjectId(serverId),
        );
        const serverUnreadEvent: IServerUnreadUpdatedEvent = {
            type: 'server_unread_updated',
            payload: { serverId, hasUnread: true },
        };
        for (const m of members) {
            const targetUserId = m.userId.toString();
            if (targetUserId === userId) continue;
            try {
                const hasView =
                    await this.permissionService.hasChannelPermission(
                        new mongoose.Types.ObjectId(serverId),
                        new mongoose.Types.ObjectId(targetUserId),
                        new mongoose.Types.ObjectId(channelId),
                        'viewChannels',
                    );
                if (hasView) {
                    this.wsServer.broadcastToUser(
                        targetUserId,
                        serverUnreadEvent,
                    );
                }
            } catch (err) {
                logger.debug(
                    `[ServerController] Skip server_unread for user ${targetUserId}: ${(err as Error).message}`,
                );
            }
        }

        let slowModeNextMessageAllowedAt: string | null = null;
        if (channel?.slowMode && channel.slowMode > 0) {
            const lastSentAt =
                created.createdAt instanceof Date
                    ? created.createdAt
                    : new Date(created.createdAt);
            slowModeNextMessageAllowedAt = new Date(
                lastSentAt.getTime() + channel.slowMode * 1000,
            ).toISOString();
        }

        return {
            messageId: created._id.toString(),
            serverId,
            channelId,
            senderId: userId,
            text: created.text,
            createdAt:
                created.createdAt?.toISOString() || new Date().toISOString(),
            replyToId: created.replyToId?.toString(),
            slowModeNextMessageAllowedAt,
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
        const message = await this.serverMessageRepo.findById(
            new mongoose.Types.ObjectId(messageId),
        );
        if (!message) {
            throw new Error('NOT_FOUND: Message not found');
        }

        // Validate ownership
        if (message.senderId.toString() !== userId) {
            throw new Error('FORBIDDEN: Can only edit your own messages');
        }

        // Update message
        const updated = await this.serverMessageRepo.update(
            new mongoose.Types.ObjectId(messageId),
            {
                text,
                editedAt: new Date(),
                isEdited: true,
            },
        );
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
        const message = await this.serverMessageRepo.findById(
            new mongoose.Types.ObjectId(messageId),
        );
        if (!message) {
            throw new Error('NOT_FOUND: Message not found');
        }

        const isAuthor = message.senderId.toString() === userId;
        const canManage = await this.permissionService.hasChannelPermission(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
            message.channelId,
            'manageMessages',
        );
        const canDeleteOthers =
            await this.permissionService.hasChannelPermission(
                new mongoose.Types.ObjectId(serverId),
                new mongoose.Types.ObjectId(userId),
                message.channelId,
                'deleteMessagesOfOthers',
            );

        if (!isAuthor && !canManage && !canDeleteOthers) {
            throw new Error('FORBIDDEN: No permission to delete this message');
        }

        // Delete message
        await this.serverMessageRepo.delete(
            new mongoose.Types.ObjectId(messageId),
        );

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
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
        );
        if (!member) {
            throw new Error('FORBIDDEN: Not a member of this server');
        }

        // Update read state
        const updatedRead = await this.serverChannelReadRepo.upsert(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(channelId),
            new mongoose.Types.ObjectId(userId),
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

        // Notify whether server still has unread channels for this user
        const channels = await this.channelRepo.findByServerIds([
            new mongoose.Types.ObjectId(serverId),
        ]);
        const reads = await this.serverChannelReadRepo.findByUserId(
            new mongoose.Types.ObjectId(userId),
        );
        const readMap = new Map(
            reads.map((r) => [r.channelId.toString(), r.lastReadAt as Date]),
        );
        const hasUnread = channels.some((ch) => {
            const lastMessageAt = ch.lastMessageAt;
            if (!lastMessageAt) return false;
            const lastReadAt = readMap.get(ch._id.toString());
            return (
                !lastReadAt || new Date(lastMessageAt) > new Date(lastReadAt)
            );
        });
        this.wsServer.broadcastToUser(userId, {
            type: 'server_unread_updated',
            payload: { serverId, hasUnread },
        } as IServerUnreadUpdatedEvent);

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
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
            new mongoose.Types.ObjectId(channelId),
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
                if (mongoose.Types.ObjectId.isValid(match[1])) {
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
                if (mongoose.Types.ObjectId.isValid(match[1])) {
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
            const allMembers = await this.serverMemberRepo.findByServerId(
                new mongoose.Types.ObjectId(serverId),
            );
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
            const allMembers = await this.serverMemberRepo.findByServerId(
                new mongoose.Types.ObjectId(serverId),
            );
            allMembers.forEach((m) => {
                if (m.userId.toString() !== senderId) {
                    allMentionedUserIds.add(m.userId.toString());
                }
            });
        }

        const channel = await this.channelRepo.findById(
            new mongoose.Types.ObjectId(channelId),
        );
        const channelName = channel ? channel.name : 'Unknown';

        // Send ping notifications to mentioned users
        for (const mentionedUserId of allMentionedUserIds) {
            const mentionedUser = await this.userRepo.findById(
                new mongoose.Types.ObjectId(mentionedUserId),
            );
            if (!mentionedUser?.username) continue;

            // Check if mentioned user is a member
            const mentionedMember =
                await this.serverMemberRepo.findByServerAndUser(
                    new mongoose.Types.ObjectId(serverId),
                    new mongoose.Types.ObjectId(mentionedUserId),
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

            await this.pingService.addPing(
                new mongoose.Types.ObjectId(mentionedUserId),
                pingData,
            );

            notifyUser(mentionedUserId, 'mention', {
                type: 'mention',
                senderName: senderUsername,
                channelName,
                preview: message.text,
            }).catch((err) =>
                logger.error(
                    `[ServerController] Failed to push notify: ${err}`,
                ),
            );

            // Emit socket event only for online users
            if (await this.wsServer.isUserOnline(mentionedUserId)) {
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
