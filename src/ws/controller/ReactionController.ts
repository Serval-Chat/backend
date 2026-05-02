import { injectable, inject } from 'inversify';
import mongoose from 'mongoose';
import { WsController, Event, NeedAuth, Validate } from '@/ws/decorators';
import type { WebSocket } from 'ws';
import {
    AddReactionSchema,
    RemoveReactionSchema,
} from '@/validation/schemas/ws/messages.schema';
import type {
    IAddReactionEvent,
    IReactionAddedEvent,
    IRemoveReactionEvent,
    IReactionRemovedEvent,
} from '@/ws/protocol/events/reactions';
import { TYPES } from '@/di/types';
import type { IMessageRepository } from '@/di/interfaces/IMessageRepository';
import type { IServerMessageRepository } from '@/di/interfaces/IServerMessageRepository';
import type { IReactionRepository } from '@/di/interfaces/IReactionRepository';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IMentionEvent } from '@/ws/protocol/events/mentions';
import type { PermissionService } from '@/permissions/PermissionService';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import type { IWsUser } from '@/ws/types';
import type { IBlockRepository } from '@/di/interfaces/IBlockRepository';
import { BlockFlags } from '@/privacy/blockFlags';
import logger from '@/utils/logger';

/**
 * Controller for handling message reaction events.
 */
@injectable()
@WsController()
export class ReactionController {
    @inject(TYPES.WsServer) private wsServer!: IWsServer;

    public constructor(
        @inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @inject(TYPES.ReactionRepository)
        private reactionRepo: IReactionRepository,
        @inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @inject(TYPES.BlockRepository) private blockRepo: IBlockRepository,
    ) {}

    /**
     * Handles 'add_reaction' event.
     * Adds a reaction to a message (DM or server message).
     */
    @Event('add_reaction')
    @NeedAuth()
    @Validate(AddReactionSchema)
    public async onAddReaction(
        payload: IAddReactionEvent['payload'],
        authenticatedUser?: IWsUser,
        ws?: WebSocket,
    ): Promise<{ success: boolean }> {
        if (authenticatedUser === undefined) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const { messageId, emoji, emojiType, emojiId, messageType } = payload;
        const userId = authenticatedUser.userId;

        if (messageType === 'dm') {
            const message = await this.messageRepo.findById(
                new mongoose.Types.ObjectId(messageId),
            );
            if (message === null) {
                throw new Error('NOT_FOUND: Message not found');
            }

            const isParticipant =
                message.senderId.toString() === userId ||
                message.receiverId.toString() === userId;

            if (!isParticipant) {
                throw new Error('FORBIDDEN: Not part of this conversation');
            }

            const receiverId =
                message.senderId.toString() === userId
                    ? message.receiverId
                    : message.senderId;
            const blockFlags = await this.blockRepo.getActiveBlockFlags(
                receiverId,
                new mongoose.Types.ObjectId(userId),
            );
            if ((blockFlags & BlockFlags.BLOCK_REACTIONS) !== 0) {
                return { success: true };
            }

            await this.reactionRepo.addReaction(
                new mongoose.Types.ObjectId(messageId),
                'dm',
                new mongoose.Types.ObjectId(userId),
                emoji,
                emojiType,
                emojiId,
            );

            logger.debug(
                `[ReactionController] User ${userId} added reaction ${emoji} (${emojiType}) to DM ${messageId}`,
            );

            // Broadcast to both participants
            const broadcastPayload: IReactionAddedEvent['payload'] = {
                messageId,
                userId,
                username: authenticatedUser.username,
                emoji,
                emojiType,
                emojiId,
                messageType: 'dm',
            };

            this.wsServer.broadcastToUser(
                message.senderId.toString(),
                {
                    type: 'reaction_added',
                    payload: broadcastPayload,
                },
                undefined,
                ws,
            );

            this.wsServer.broadcastToUser(
                message.receiverId.toString(),
                {
                    type: 'reaction_added',
                    payload: broadcastPayload,
                },
                undefined,
                ws,
            );

            // Send notification to author if they are not the reactor
            if (message.senderId.toString() !== userId) {
                const authorId = message.senderId.toString();
                const [author, receiver] = await Promise.all([
                    this.userRepo.findById(
                        new mongoose.Types.ObjectId(authorId),
                    ),
                    this.userRepo.findById(message.receiverId),
                ]);

                if (author && receiver) {
                    const mentionPayload: IMentionEvent['payload'] = {
                        type: 'reaction',
                        senderId: userId,
                        sender: authenticatedUser.username,
                        message: {
                            messageId: messageId,
                            senderId: authorId,
                            senderUsername: author.username ?? 'Unknown User',
                            receiverId: message.receiverId.toString(),
                            receiverUsername:
                                receiver.username ?? 'Unknown User',
                            text: message.text,
                            createdAt: (message.createdAt ?? new Date()).toISOString(),
                            replyToId: message.replyToId?.toString(),
                            isEdited: message.isEdited ?? false,
                        },
                    };

                    this.wsServer.broadcastToUser(authorId, {
                        type: 'mention',
                        payload: mentionPayload,
                    });
                }
            }
        } else {
            const message = await this.serverMessageRepo.findById(
                new mongoose.Types.ObjectId(messageId),
            );
            if (message === null) {
                throw new Error('NOT_FOUND: Message not found');
            }

            // Check if user has access to the channel
            const serverId = message.serverId.toString();
            const channelId = message.channelId.toString();

            const canReact = await this.permissionService.hasChannelPermission(
                new mongoose.Types.ObjectId(serverId),
                new mongoose.Types.ObjectId(userId),
                new mongoose.Types.ObjectId(channelId),
                'addReactions',
            );

            if (!canReact) {
                throw new Error('FORBIDDEN: No permission to add reactions');
            }

            const serverBlockFlags = await this.blockRepo.getActiveBlockFlags(
                message.senderId,
                new mongoose.Types.ObjectId(userId),
            );
            if ((serverBlockFlags & BlockFlags.BLOCK_REACTIONS) !== 0) {
                return { success: true };
            }

            // Add reaction
            await this.reactionRepo.addReaction(
                new mongoose.Types.ObjectId(messageId),
                'server',
                new mongoose.Types.ObjectId(userId),
                emoji,
                emojiType,
                emojiId,
            );

            logger.debug(
                `[ReactionController] User ${userId} added reaction ${emoji} (${emojiType}) to server message ${messageId}`,
            );

            // Broadcast to channel
            const broadcastPayload: IReactionAddedEvent['payload'] = {
                messageId,
                userId,
                username: authenticatedUser.username,
                emoji,
                emojiType,
                emojiId,
                messageType: 'server',
                serverId,
                channelId,
            };

            this.wsServer.broadcastToChannel(
                channelId,
                {
                    type: 'reaction_added',
                    payload: broadcastPayload,
                },
                undefined,
                ws,
            );

            await this.wsServer.broadcastToServerWithPermission(
                serverId,
                {
                    type: 'reaction_added',
                    payload: broadcastPayload,
                },
                {
                    type: 'channel',
                    targetId: channelId,
                    permission: 'viewChannels',
                },
                undefined,
                ws,
                { onlyBots: true },
            );

            // Send notification to message author if they are not the reactor
            if (message.senderId.toString() !== userId) {
                const authorId = message.senderId.toString();
                const author = await this.userRepo.findById(
                    new mongoose.Types.ObjectId(authorId),
                );
                if (author) {
                    const mentionPayload: IMentionEvent['payload'] = {
                        type: 'reaction',
                        senderId: userId,
                        sender: authenticatedUser.username,
                        serverId,
                        channelId,
                        message: {
                            messageId: messageId,
                            serverId,
                            channelId,
                            senderId: authorId,
                            senderUsername: author.username ?? 'Unknown User',
                            text: message.text,
                            createdAt: message.createdAt.toISOString(),
                            replyToId: message.replyToId?.toString(),
                            isEdited: message.isEdited ?? false,
                            isPinned: message.isPinned ?? false,
                            isSticky: message.isSticky ?? false,
                            isWebhook: message.isWebhook ?? false,
                        },
                    };

                    this.wsServer.broadcastToUser(authorId, {
                        type: 'mention',
                        payload: mentionPayload,
                    });
                }
            }
        }

        return { success: true };
    }

    /**
     * Handles 'remove_reaction' event.
     * Removes a reaction from a message.
     */
    @Event('remove_reaction')
    @NeedAuth()
    @Validate(RemoveReactionSchema)
    public async onRemoveReaction(
        payload: IRemoveReactionEvent['payload'],
        authenticatedUser?: IWsUser,
        ws?: WebSocket,
    ): Promise<{ success: boolean }> {
        if (authenticatedUser === undefined) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const { messageId, emoji, emojiType, emojiId, messageType } = payload;
        const userId = authenticatedUser.userId;

        // Validate message exists and get context
        if (messageType === 'dm') {
            const message = await this.messageRepo.findById(
                new mongoose.Types.ObjectId(messageId),
            );
            if (message === null) {
                throw new Error('NOT_FOUND: Message not found');
            }

            // Validate user is part of the conversation
            const isParticipant =
                message.senderId.toString() === userId ||
                message.receiverId.toString() === userId;

            if (!isParticipant) {
                throw new Error('FORBIDDEN: Not part of this conversation');
            }

            // Remove reaction
            await this.reactionRepo.removeReaction(
                new mongoose.Types.ObjectId(messageId),
                'dm',
                new mongoose.Types.ObjectId(userId),
                emoji,
                emojiId,
            );

            logger.debug(
                `[ReactionController] User ${userId} removed reaction ${emoji} (${emojiType}) from DM ${messageId}`,
            );

            // Broadcast to both participants
            const broadcastPayload: IReactionRemovedEvent['payload'] = {
                messageId,
                userId,
                emoji,
                emojiType,
                emojiId,
                messageType: 'dm',
            };

            this.wsServer.broadcastToUser(
                message.senderId.toString(),
                {
                    type: 'reaction_removed',
                    payload: broadcastPayload,
                },
                undefined,
                ws,
            );

            this.wsServer.broadcastToUser(
                message.receiverId.toString(),
                {
                    type: 'reaction_removed',
                    payload: broadcastPayload,
                },
                undefined,
                ws,
            );
        } else {
            const message = await this.serverMessageRepo.findById(
                new mongoose.Types.ObjectId(messageId),
            );
            if (message === null) {
                throw new Error('NOT_FOUND: Message not found');
            }

            const channelId = message.channelId.toString();

            // Remove reaction
            await this.reactionRepo.removeReaction(
                new mongoose.Types.ObjectId(messageId),
                'server',
                new mongoose.Types.ObjectId(userId),
                emoji,
                emojiId,
            );

            logger.debug(
                `[ReactionController] User ${userId} removed reaction ${emoji} (${emojiType}) from server message ${messageId}`,
            );

            // Broadcast to channel
            const broadcastPayload: IReactionRemovedEvent['payload'] = {
                messageId,
                userId,
                emoji,
                emojiType,
                emojiId,
                messageType: 'server',
                serverId: message.serverId.toString(),
                channelId,
            };

            this.wsServer.broadcastToChannel(
                channelId,
                {
                    type: 'reaction_removed',
                    payload: broadcastPayload,
                },
                undefined,
                ws,
            );

            await this.wsServer.broadcastToServerWithPermission(
                message.serverId.toString(),
                {
                    type: 'reaction_removed',
                    payload: broadcastPayload,
                },
                {
                    type: 'channel',
                    targetId: channelId,
                    permission: 'viewChannels',
                },
                undefined,
                ws,
                { onlyBots: true },
            );
        }

        return { success: true };
    }
}
