import { injectable, inject } from 'inversify';
import { Gateway, On } from '@/realtime/core/decorators';
import { SocketContext } from '@/realtime/core/types';
import {
    JoinServerSchema,
    LeaveServerSchema,
    JoinChannelSchema,
    LeaveChannelSchema,
    ServerMessageSchema,
    MarkChannelReadSchema,
    ServerTypingSchema,
    EditServerMessageSchema,
    DeleteServerMessageSchema,
    ServerMemberJoinedSchema,
    ServerMemberLeftSchema,
    ServerOwnershipTransferredSchema,
} from '@/validation/schemas/realtime/server.schema';
import { TYPES } from '@/di/types';
import { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { IServerMessageRepository } from '@/di/interfaces/IServerMessageRepository';
import { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import { IServerChannelReadRepository } from '@/di/interfaces/IServerChannelReadRepository';
import { IUserRepository } from '@/di/interfaces/IUserRepository';
import { IRoleRepository } from '@/di/interfaces/IRoleRepository';
import { PermissionService } from '@/services/PermissionService';
import { PresenceService } from '@/realtime/services/PresenceService';
import { z } from 'zod';
import { messagesSentCounter, websocketMessagesCounter } from '@/utils/metrics';
import { PingService } from '@/services/PingService';
import { getIO } from '@/socket';

/**
 * Server Gateway.
 *
 * Handles real-time server events.
 * Manages channels, messages, roles, and member updates.
 * Handles complex logic for mentions, permissions, and broadcasting.
 */
@injectable()
@Gateway()
export class ServerGateway {
    constructor(
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @inject(TYPES.ServerChannelReadRepository)
        private serverChannelReadRepo: IServerChannelReadRepository,
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @inject(TYPES.RoleRepository) private roleRepo: IRoleRepository,
        @inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.PresenceService) private presenceService: PresenceService,
        @inject(TYPES.PingService) private pingService: PingService,
    ) {}

    /**
     * Handles 'join_server' event.
     *
     * Subscribes the socket to server-specific updates.
     * Verifies membership before joining the room.
     */
    @On('join_server', JoinServerSchema)
    async onJoinServer(
        ctx: SocketContext,
        payload: z.infer<typeof JoinServerSchema>,
    ) {
        const { serverId } = payload;
        const userId = ctx.user.id;

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            return { ok: false, error: 'Not a member of this server' };
        }

        ctx.socket.join(`server:${serverId}`);
        return { ok: true };
    }

    @On('leave_server', LeaveServerSchema)
    async onLeaveServer(
        ctx: SocketContext,
        payload: z.infer<typeof LeaveServerSchema>,
    ) {
        const { serverId } = payload;
        ctx.socket.leave(`server:${serverId}`);
    }

    /**
     * Handles 'join_channel' event.
     *
     * Subscribes the socket to channel-specific updates.
     * Verifies membership before joining the room.
     */
    @On('join_channel', JoinChannelSchema)
    async onJoinChannel(
        ctx: SocketContext,
        payload: z.infer<typeof JoinChannelSchema>,
    ) {
        const { serverId, channelId } = payload;
        const userId = ctx.user.id;

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            return { ok: false, error: 'Not a member of this server' };
        }

        ctx.socket.join(`channel:${channelId}`);
        return { ok: true };
    }

    @On('leave_channel', LeaveChannelSchema)
    async onLeaveChannel(
        ctx: SocketContext,
        payload: z.infer<typeof LeaveChannelSchema>,
    ) {
        const { channelId } = payload;
        ctx.socket.leave(`channel:${channelId}`);
    }

    /**
     * Handles 'server_message' event.
     *
     * Sends a message to a server channel.
     * Performs extensive processing:
     * - Permission checks (sendMessages).
     * - Mention parsing (users, roles, @everyone).
     * - Permission checks for mentions (pingRolesAndEveryone).
     * - Persistence and unread tracking.
     * - Broadcasting to channel room.
     * - Sending ping notifications to mentioned users.
     */
    @On('server_message', ServerMessageSchema)
    async onServerMessage(
        ctx: SocketContext,
        payload: z.infer<typeof ServerMessageSchema>,
    ) {
        websocketMessagesCounter.labels('server_message', 'inbound').inc();
        const { serverId, channelId, text, replyToId } = payload;
        const userId = ctx.user.id;

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            return { ok: false, error: 'Not a member of this server' };
        }

        const canSend = await this.permissionService.hasChannelPermission(
            serverId,
            userId,
            channelId,
            'sendMessages',
        );
        if (!canSend) {
            return { ok: false, error: 'No permission to send messages' };
        }

        // Parse mentions from message text and send ping notifications
        const parseMentions = (
            text: string,
        ): { userIds: string[]; roleIds: string[]; everyone: boolean } => {
            const userIds: string[] = [];
            const roleIds: string[] = [];
            let everyone = false;

            // Parse user mentions: <userid:'userId'>
            const userMentionRegex = /<userid:'([^']+)'>/g;
            let match;
            while ((match = userMentionRegex.exec(text)) !== null) {
                if (match[1]) {
                    userIds.push(match[1]);
                }
            }

            // Parse role mentions: <roleid:'roleId'>
            const roleMentionRegex = /<roleid:'([^']+)'>/g;
            while ((match = roleMentionRegex.exec(text)) !== null) {
                if (match[1]) {
                    roleIds.push(match[1]);
                }
            }

            // Parse @everyone mention: <everyone>
            const everyoneRegex = /<everyone>/g;
            if (everyoneRegex.test(text)) {
                everyone = true;
            }

            return { userIds, roleIds, everyone };
        };

        // Replace internal mention format with display format
        const replaceMentionsForDisplay = async (
            text: string,
            userMap: Map<
                string,
                { username: string; displayName?: string | null }
            >,
        ): Promise<string> => {
            let result = text;

            // Replace user mentions
            result = result.replace(/<userid:'([^']+)'>/g, (match, userId) => {
                const user = userMap.get(userId);
                if (user) {
                    return `@${user.username}`;
                }
                return match; // Keep original if user not found
            });

            // Replace role mentions
            for (const roleId of mentionedRoleIds) {
                const role = await this.roleRepo.findById(roleId);
                if (role) {
                    result = result.replace(
                        new RegExp(`<roleid:'${roleId}'>`, 'g'),
                        `@${role.name}`,
                    );
                }
            }

            // Replace @everyone mention
            if (mentionedEveryone) {
                result = result.replace(/<everyone>/g, '@everyone');
            }

            return result;
        };

        // Parse mentions from message
        const {
            userIds: mentionedUserIds,
            roleIds: mentionedRoleIds,
            everyone: mentionedEveryone,
        } = parseMentions(text);

        // Check permission for pinging @everyone
        if (mentionedEveryone) {
            const canPingEveryone = await this.permissionService.hasPermission(
                serverId,
                userId,
                'pingRolesAndEveryone',
            );
            if (!canPingEveryone) {
                return { ok: false, error: 'No permission to ping @everyone' };
            }
        }

        // Check permission for pinging roles
        if (mentionedRoleIds.length > 0) {
            const canPingRoles = await this.permissionService.hasPermission(
                serverId,
                userId,
                'pingRolesAndEveryone',
            );
            if (!canPingRoles) {
                return { ok: false, error: 'No permission to ping roles' };
            }
        }

        // Create user map for mention display replacement
        const userMap = new Map<
            string,
            { username: string; displayName?: string | null }
        >();

        // Fetch mentioned users and validate they exist and are server members
        const validMentions: string[] = [];
        for (const mentionedUserId of mentionedUserIds) {
            if (mentionedUserId === userId) continue; // Skip self-mentions

            const mentionedUser = await this.userRepo.findById(mentionedUserId);
            if (mentionedUser) {
                validMentions.push(mentionedUserId);
                userMap.set(mentionedUserId, {
                    username: mentionedUser.username || '',
                    displayName: mentionedUser.displayName ?? null,
                });
            }
        }

        // Get all members for role mentions
        const roleMentionedUserIds = new Set<string>();
        if (mentionedRoleIds.length > 0) {
            const allMembers =
                await this.serverMemberRepo.findByServerId(serverId);
            for (const roleId of mentionedRoleIds) {
                const membersWithRole = allMembers.filter((m) =>
                    m.roles.some((r) => r.toString() === roleId),
                );
                membersWithRole.forEach((m) => {
                    if (m.userId.toString() !== userId) {
                        // Skip self
                        roleMentionedUserIds.add(m.userId.toString());
                    }
                });
            }
        }

        // Get all members for @everyone mention
        if (mentionedEveryone) {
            const allMembers =
                await this.serverMemberRepo.findByServerId(serverId);
            allMembers.forEach((m) => {
                if (m.userId.toString() !== userId) {
                    // Skip self
                    roleMentionedUserIds.add(m.userId.toString());
                }
            });
        }

        // Combine all mentioned user IDs
        const allMentionedUserIds = [
            ...new Set([...validMentions, ...Array.from(roleMentionedUserIds)]),
        ];

        // Replace mentions with display format for storage
        await replaceMentionsForDisplay(text, userMap);

        const created = await this.serverMessageRepo.create({
            serverId,
            channelId,
            senderId: userId,
            text: text, // Store raw text with <userid:'...'> format
            ...(replyToId ? { replyToId } : {}),
        });

        messagesSentCounter.labels('server').inc();

        await this.channelRepo.updateLastMessageAt(channelId);
        await this.serverChannelReadRepo.upsert(serverId, channelId, userId);

        // Broadcast to channel
        ctx.socket.to(`channel:${channelId}`).emit('server_message', created);
        // Emit to self as well
        ctx.socket.emit('server_message', created);

        websocketMessagesCounter.labels('server_message', 'outbound').inc();

        // Send ping notifications to mentioned users (both direct mentions and role/everyone mentions)
        for (const mentionedUserId of allMentionedUserIds) {
            const mentionedUser = await this.userRepo.findById(mentionedUserId);
            if (mentionedUser?.username) {
                // Check if mentioned user is a member of the server
                const mentionedMember =
                    await this.serverMemberRepo.findByServerAndUser(
                        serverId,
                        mentionedUserId,
                    );
                if (mentionedMember) {
                    // Store ping for ALL users (online and offline)
                    const pingData = {
                        type: 'mention' as const,
                        sender: ctx.user.username,
                        senderId: userId,
                        serverId,
                        channelId,
                        message: created,
                    };

                    const storedPing = await this.pingService.addPing(
                        mentionedUserId,
                        pingData,
                    );

                    // Emit socket event only for online users
                    const mentionedSockets = this.presenceService?.getSockets(
                        mentionedUser.username,
                    );
                    if (mentionedSockets && mentionedSockets.length > 0) {
                        const io = getIO();
                        mentionedSockets.forEach((sid: string) => {
                            io.to(sid).emit('ping', storedPing);
                            websocketMessagesCounter
                                .labels('ping', 'outbound')
                                .inc();
                        });
                    }
                }
            }
        }

        // Notify server about unread
        ctx.socket.to(`server:${serverId}`).emit('channel_unread', {
            serverId,
            channelId,
            lastMessageAt: created.createdAt,
            senderId: userId,
        });

        return { ok: true, msg: created };
    }

    /**
     * Handles 'mark_channel_read' event.
     *
     * Marks a channel as read for the user.
     * Updates the last read timestamp and notifies other sessions.
     */
    @On('mark_channel_read', MarkChannelReadSchema)
    async onMarkChannelRead(
        ctx: SocketContext,
        payload: z.infer<typeof MarkChannelReadSchema>,
    ) {
        const { serverId, channelId } = payload;
        const userId = ctx.user.id;

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            return { ok: false, error: 'Not a member of this server' };
        }

        const updatedRead = await this.serverChannelReadRepo.upsert(
            serverId,
            channelId,
            userId,
        );

        if (updatedRead) {
            ctx.socket.emit('channel_unread', {
                serverId,
                channelId,
                lastMessageAt: null,
                senderId: userId,
                lastReadAt: updatedRead.lastReadAt,
            });
        }

        return { ok: true };
    }

    /**
     * Handles 'server_typing' event.
     *
     * Broadcasts typing indicator to the channel.
     * Verifies 'sendMessages' permission.
     */
    @On('server_typing', ServerTypingSchema)
    async onServerTyping(
        ctx: SocketContext,
        payload: z.infer<typeof ServerTypingSchema>,
    ) {
        const { serverId, channelId } = payload;
        const userId = ctx.user.id;

        const canSend = await this.permissionService.hasChannelPermission(
            serverId,
            userId,
            channelId,
            'sendMessages',
        );
        if (!canSend) return;

        ctx.socket.to(`channel:${channelId}`).emit('server_typing', {
            from: ctx.user.username,
            channelId,
        });
    }

    /**
     * Handles 'edit_server_message' event.
     *
     * Edits an existing server message.
     * Verifies ownership before updating.
     */
    @On('edit_server_message', EditServerMessageSchema)
    async onEditServerMessage(
        ctx: SocketContext,
        payload: z.infer<typeof EditServerMessageSchema>,
    ) {
        const { messageId, text } = payload;
        const userId = ctx.user.id;

        const message = await this.serverMessageRepo.findById(messageId);
        if (!message) return { ok: false, error: 'message not found' };

        if (message.senderId.toString() !== userId) {
            return { ok: false, error: 'unauthorized' };
        }

        const updated = await this.serverMessageRepo.update(messageId, {
            text,
            editedAt: new Date(),
            isEdited: true,
        });
        if (!updated) return { ok: false, error: 'failed to update message' };

        ctx.socket
            .to(`channel:${message.channelId}`)
            .emit('server_message_edited', updated);
        ctx.socket.emit('server_message_edited', updated);

        return { ok: true, message: updated };
    }

    /**
     * Handles 'delete_server_message' event.
     *
     * Deletes a server message.
     * Allows deletion by author OR users with 'manageMessages' permission.
     */
    @On('delete_server_message', DeleteServerMessageSchema)
    async onDeleteServerMessage(
        ctx: SocketContext,
        payload: z.infer<typeof DeleteServerMessageSchema>,
    ) {
        const { serverId, messageId } = payload;
        const userId = ctx.user.id;

        const message = await this.serverMessageRepo.findById(messageId);
        if (!message) return { ok: false, error: 'message not found' };

        const canDelete =
            message.senderId.toString() === userId ||
            (await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageMessages',
            ));

        if (!canDelete) {
            return { ok: false, error: 'unauthorized' };
        }

        await this.serverMessageRepo.delete(messageId);

        ctx.socket
            .to(`channel:${message.channelId}`)
            .emit('server_message_deleted', { messageId });
        ctx.socket.emit('server_message_deleted', { messageId });

        return { ok: true };
    }

    // Legacy/Client-triggered events
    @On('server_member_joined', ServerMemberJoinedSchema)
    async onServerMemberJoined(
        ctx: SocketContext,
        payload: z.infer<typeof ServerMemberJoinedSchema>,
    ) {
        const { serverId, userId } = payload;
        // Ideally verify if user actually joined recently?
        ctx.socket
            .to(`server:${serverId}`)
            .emit('server_member_joined', { userId });
    }

    @On('server_member_left', ServerMemberLeftSchema)
    async onServerMemberLeft(
        ctx: SocketContext,
        payload: z.infer<typeof ServerMemberLeftSchema>,
    ) {
        const { serverId, userId } = payload;
        ctx.socket
            .to(`server:${serverId}`)
            .emit('server_member_left', { userId });
    }

    @On('server_ownership_transferred', ServerOwnershipTransferredSchema)
    async onServerOwnershipTransferred(
        ctx: SocketContext,
        payload: z.infer<typeof ServerOwnershipTransferredSchema>,
    ) {
        const { serverId } = payload;
        ctx.socket
            .to(`server:${serverId}`)
            .emit('server_ownership_transferred', payload);
    }
}
