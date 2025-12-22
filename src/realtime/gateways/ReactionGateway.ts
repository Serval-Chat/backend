import { injectable, inject } from 'inversify';
import { Gateway, On } from '../core/decorators';
import { SocketContext } from '../core/types';
import {
    ReactionEventSchema,
    ReactionEventData,
} from '../../validation/schemas/realtime/reaction.schema';
import { TYPES } from '../../di/types';
import { IReactionRepository } from '../../di/interfaces/IReactionRepository';
import { IMessageRepository } from '../../di/interfaces/IMessageRepository';
import { IServerMessageRepository } from '../../di/interfaces/IServerMessageRepository';
import { IServerMemberRepository } from '../../di/interfaces/IServerMemberRepository';
import { PresenceService } from '../services/PresenceService';
import { getIO } from '../../socket';
import logger from '../../utils/logger';

/**
 * Reaction Gateway.
 *
 * Manages WebSocket events for emoji reactions.
 * Provides real-time updates when users add or remove reactions.
 * Handles both DM and Server message reactions.
 */
@injectable()
@Gateway()
export class ReactionGateway {
    constructor(
        @inject(TYPES.ReactionRepository)
        private reactionRepo: IReactionRepository,
        @inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.PresenceService) private presenceService: PresenceService,
    ) {}

    /**
     * Handles 'add_reaction' event.
     *
     * Adds a reaction to a message.
     * Validates permissions and broadcasts the update to relevant users.
     */
    @On('add_reaction', ReactionEventSchema)
    async onAddReaction(ctx: SocketContext, data: ReactionEventData) {
        const {
            messageId,
            messageType,
            emoji,
            emojiType,
            emojiId,
            serverId,
            channelId,
        } = data;
        const userId = ctx.user.id;

        try {
            if (messageType === 'dm') {
                const message = await this.messageRepo.findById(messageId);
                if (!message) return { ok: false, error: 'Message not found' };

                if (
                    message.senderId.toString() !== userId &&
                    message.receiverId.toString() !== userId
                ) {
                    return { ok: false, error: 'Access denied' };
                }

                await this.reactionRepo.addReaction(
                    messageId,
                    'dm',
                    userId,
                    emoji,
                    emojiType,
                    emojiId,
                );
                const reactions = await this.reactionRepo.getReactionsByMessage(
                    messageId,
                    'dm',
                    userId,
                );

                const otherUserId =
                    message.senderId.toString() === userId
                        ? message.receiverId.toString()
                        : message.senderId.toString();

                const otherUser = await (
                    this.messageRepo as any
                ).userRepo?.findById(otherUserId); // Hacky but we need username

                // Let's emit to the sender
                ctx.socket.emit('reaction_added', {
                    messageId,
                    messageType: 'dm',
                    reactions,
                });

                // And emit to receiver if online
            } else if (messageType === 'server') {
                if (!serverId || !channelId)
                    return {
                        ok: false,
                        error: 'serverId and channelId required',
                    };

                const member = await this.serverMemberRepo.findByServerAndUser(
                    serverId,
                    userId,
                );
                if (!member) return { ok: false, error: 'Not a server member' };

                const message =
                    await this.serverMessageRepo.findById(messageId);
                if (!message || message.channelId.toString() !== channelId) {
                    return { ok: false, error: 'Message not found' };
                }

                await this.reactionRepo.addReaction(
                    messageId,
                    'server',
                    userId,
                    emoji,
                    emojiType,
                    emojiId,
                );
                const reactions = await this.reactionRepo.getReactionsByMessage(
                    messageId,
                    'server',
                    userId,
                );

                const io = getIO();
                io.to(`server:${serverId}`).emit('reaction_added', {
                    messageId,
                    messageType: 'server',
                    serverId,
                    channelId,
                    reactions,
                });
            }
            return { ok: true };
        } catch (err: any) {
            logger.error('[ReactionGateway] Error adding reaction:', err);
            return {
                ok: false,
                error: err.message || 'Failed to add reaction',
            };
        }
    }

    /**
     * Handles 'remove_reaction' event.
     *
     * Removes a reaction from a message.
     * Validates permissions and broadcasts the update.
     */
    @On('remove_reaction', ReactionEventSchema)
    async onRemoveReaction(ctx: SocketContext, data: ReactionEventData) {
        const { messageId, messageType, emoji, emojiId, serverId, channelId } =
            data;
        const userId = ctx.user.id;

        try {
            if (messageType === 'dm') {
                const message = await this.messageRepo.findById(messageId);
                if (!message) return { ok: false, error: 'Message not found' };

                if (
                    message.senderId.toString() !== userId &&
                    message.receiverId.toString() !== userId
                ) {
                    return { ok: false, error: 'Access denied' };
                }

                const removed = await this.reactionRepo.removeReaction(
                    messageId,
                    'dm',
                    userId,
                    emoji,
                    emojiId,
                );
                if (!removed) return { ok: false, error: 'Reaction not found' };

                const reactions = await this.reactionRepo.getReactionsByMessage(
                    messageId,
                    'dm',
                    userId,
                );
                ctx.socket.emit('reaction_removed', {
                    messageId,
                    messageType: 'dm',
                    reactions,
                });

                // Similar to add_reaction, need to notify the other user.
            } else if (messageType === 'server') {
                if (!serverId || !channelId)
                    return {
                        ok: false,
                        error: 'serverId and channelId required',
                    };

                const member = await this.serverMemberRepo.findByServerAndUser(
                    serverId,
                    userId,
                );
                if (!member) return { ok: false, error: 'Not a server member' };

                const message =
                    await this.serverMessageRepo.findById(messageId);
                if (!message || message.channelId.toString() !== channelId) {
                    return { ok: false, error: 'Message not found' };
                }

                const removed = await this.reactionRepo.removeReaction(
                    messageId,
                    'server',
                    userId,
                    emoji,
                    emojiId,
                );
                if (!removed) return { ok: false, error: 'Reaction not found' };

                const reactions = await this.reactionRepo.getReactionsByMessage(
                    messageId,
                    'server',
                    userId,
                );

                const io = getIO();
                io.to(`server:${serverId}`).emit('reaction_removed', {
                    messageId,
                    messageType: 'server',
                    serverId,
                    channelId,
                    reactions,
                });
            }
            return { ok: true };
        } catch (err: any) {
            logger.error('[ReactionGateway] Error removing reaction:', err);
            return {
                ok: false,
                error: err.message || 'Failed to remove reaction',
            };
        }
    }
}
