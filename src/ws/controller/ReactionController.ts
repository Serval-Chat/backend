import { injectable, inject } from 'inversify';
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
import type { PermissionService } from '@/services/PermissionService';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import type { IWsUser } from '@/ws/types';
import logger from '@/utils/logger';

/**
 * Controller for handling message reaction events.
 */
@injectable()
@WsController()
export class ReactionController {
    @inject(TYPES.WsServer) private wsServer!: IWsServer;

    constructor(
        @inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @inject(TYPES.ReactionRepository)
        private reactionRepo: IReactionRepository,
        @inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
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
        if (!authenticatedUser) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const { messageId, emoji, emojiType, emojiId, messageType } = payload;
        const userId = authenticatedUser.userId;

        if (messageType === 'dm') {
            const message = await this.messageRepo.findById(messageId);
            if (!message) {
                throw new Error('NOT_FOUND: Message not found');
            }

            const isParticipant =
                message.senderId.toString() === userId ||
                message.receiverId.toString() === userId;

            if (!isParticipant) {
                throw new Error('FORBIDDEN: Not part of this conversation');
            }

            await this.reactionRepo.addReaction(
                messageId,
                'dm',
                userId,
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
                    this.userRepo.findById(authorId),
                    this.userRepo.findById(message.receiverId.toString()),
                ]);

                if (author && receiver) {
                    const mentionPayload: IMentionEvent['payload'] = {
                        type: 'reaction',
                        senderId: userId,
                        sender: authenticatedUser.username,
                        message: {
                            messageId: messageId,
                            senderId: authorId,
                            senderUsername: author.username || 'Unknown User',
                            receiverId: message.receiverId.toString(),
                            receiverUsername:
                                receiver.username || 'Unknown User',
                            text: message.text,
                            createdAt:
                                message.createdAt instanceof Date
                                    ? message.createdAt.toISOString()
                                    : (message.createdAt as unknown as string) ||
                                      new Date().toISOString(),
                            replyToId: message.replyToId?.toString(),
                            isEdited: message.isEdited || false,
                        },
                    };

                    this.wsServer.broadcastToUser(authorId, {
                        type: 'mention',
                        payload: mentionPayload,
                    });
                }
            }
        } else if (messageType === 'server') {
            const message = await this.serverMessageRepo.findById(messageId);
            if (!message) {
                throw new Error('NOT_FOUND: Message not found');
            }

            // Check if user has access to the channel
            const serverId = message.serverId.toString();
            const channelId = message.channelId.toString();

            const canReact = await this.permissionService.hasChannelPermission(
                serverId,
                userId,
                channelId,
                'addReactions',
            );

            if (!canReact) {
                throw new Error('FORBIDDEN: No permission to add reactions');
            }

            // Add reaction
            await this.reactionRepo.addReaction(
                messageId,
                'server',
                userId,
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

            // Send notification to message author if they are not the reactor
            if (message.senderId.toString() !== userId) {
                const authorId = message.senderId.toString();
                const author = await this.userRepo.findById(authorId);
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
                            senderUsername: author.username || 'Unknown User',
                            text: message.text,
                            createdAt:
                                message.createdAt instanceof Date
                                    ? message.createdAt.toISOString()
                                    : (message.createdAt as unknown as string) ||
                                      new Date().toISOString(),
                            replyToId: message.replyToId?.toString(),
                            isEdited: message.isEdited || false,
                            isWebhook: message.isWebhook || false,
                        },
                    };

                    this.wsServer.broadcastToUser(authorId, {
                        type: 'mention',
                        payload: mentionPayload,
                    });
                }
            }
        } else {
            throw new Error('INVALID_REQUEST: Invalid message type');
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
        if (!authenticatedUser) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const { messageId, emoji, emojiType, emojiId, messageType } = payload;
        const userId = authenticatedUser.userId;

        // Validate message exists and get context
        if (messageType === 'dm') {
            const message = await this.messageRepo.findById(messageId);
            if (!message) {
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
                messageId,
                'dm',
                userId,
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
        } else if (messageType === 'server') {
            const message = await this.serverMessageRepo.findById(messageId);
            if (!message) {
                throw new Error('NOT_FOUND: Message not found');
            }

            const channelId = message.channelId.toString();

            // Remove reaction
            await this.reactionRepo.removeReaction(
                messageId,
                'server',
                userId,
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
        } else {
            throw new Error('INVALID_REQUEST: Invalid message type');
        }

        return { success: true };
    }
}
