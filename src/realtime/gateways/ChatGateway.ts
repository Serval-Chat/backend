import { injectable, inject } from 'inversify';
import { Gateway, On } from '@/realtime/core/decorators';
import { SocketContext } from '@/realtime/core/types';
import {
    SendMessageSchema,
    MarkReadSchema,
    TypingSchema,
    EditMessageSchema,
    DeleteMessageSchema,
} from '@/validation/schemas/realtime/chat.schema';
import { PresenceService } from '@/realtime/services/PresenceService';
import { TYPES } from '@/di/types';
import { IUserRepository } from '@/di/interfaces/IUserRepository';
import { IMessageRepository } from '@/di/interfaces/IMessageRepository';
import { IDmUnreadRepository } from '@/di/interfaces/IDmUnreadRepository';
import { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import { z } from 'zod';
import { Types } from 'mongoose';
import logger from '@/utils/logger';
import { messagesSentCounter, websocketMessagesCounter } from '@/utils/metrics';

/**
 * Chat Gateway.
 *
 * Handles real-time direct messaging events.
 */
@injectable()
@Gateway()
export class ChatGateway {
    constructor(
        @inject(TYPES.PresenceService) private presenceService: PresenceService,
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @inject(TYPES.DmUnreadRepository)
        private dmUnreadRepo: IDmUnreadRepository,
        @inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
    ) { }

    /**
     * Handles 'message' event.
     *
     * Sends a direct message to another user.
     * Enforces friendship checks and prevents self-messaging.
     * Updates unread counts for the receiver.
     */
    @On('message', SendMessageSchema)
    async onMessage(
        ctx: SocketContext,
        payload: z.infer<typeof SendMessageSchema>,
    ) {
        websocketMessagesCounter.labels('message', 'inbound').inc();
        const { receiver, text, replyToId } = payload;
        if (!ctx.user) return { ok: false, error: 'Unauthorized' };
        const senderId = ctx.user.id;

        const receiverIsObjectId = Types.ObjectId.isValid(receiver);
        const receiverUser = receiverIsObjectId
            ? await this.userRepo.findById(receiver)
            : await this.userRepo.findByUsername(receiver);

        if (!receiverUser) {
            return { ok: false, error: 'receiver not found' };
        }

        const receiverId = receiverUser._id.toString();
        const receiverUsername = receiverUser.username || '';

        if (!(await this.friendshipRepo.areFriends(senderId, receiverId))) {
            return { ok: false, error: 'not friends' };
        }

        if (senderId === receiverId) {
            return { ok: false, error: 'cannot message yourself' };
        }

        const created = await this.messageRepo.create({
            senderId,
            receiverId,
            text,
            ...(replyToId ? { replyToId } : {}),
        });

        messagesSentCounter.labels('direct').inc();

        // Emit to sender and receiver
        const recipients = [ctx.user.username, receiverUsername];
        recipients.forEach((username) => {
            const sockets = this.presenceService.getSockets(username);
            sockets.forEach((sid) => {
                // Emit to self or others
                if (sid === ctx.socket.id) {
                    ctx.socket.emit('message', created);
                } else {
                    ctx.socket.to(sid).emit('message', created);
                }
                websocketMessagesCounter.labels('message', 'outbound').inc();
            });
        });

        // Unread count
        try {
            await this.dmUnreadRepo.increment(receiverId, senderId);
            const updatedUnread = await this.dmUnreadRepo.findByUserAndPeer(
                receiverId,
                senderId,
            );

            if (updatedUnread) {
                const receiverSockets =
                    this.presenceService.getSockets(receiverUsername);
                receiverSockets.forEach((sid) => {
                    ctx.socket.to(sid).emit('dm_unread', {
                        peer: ctx.user?.username,
                        count: updatedUnread.count,
                    });
                    websocketMessagesCounter
                        .labels('dm_unread', 'outbound')
                        .inc();
                });
            }
        } catch (err) {
            logger.error('Failed to update DM unread count:', err);
        }

        return { ok: true, msg: created };
    }

    /**
     * Handles 'mark_read' event.
     *
     * Marks a DM conversation as read.
     */
    @On('mark_read', MarkReadSchema)
    async onMarkRead(
        ctx: SocketContext,
        payload: z.infer<typeof MarkReadSchema>,
    ) {
        const { peerId } = payload;
        if (!ctx.user) return;
        const userId = ctx.user.id;

        await this.dmUnreadRepo.reset(userId, peerId);

        // Notify self (all sessions)
        const peerUser = await this.userRepo.findById(peerId);
        if (peerUser?.username) {
            const sockets = this.presenceService.getSockets(ctx.user.username);
            sockets.forEach((sid) => {
                if (sid === ctx.socket.id) {
                    ctx.socket.emit('dm_unread', {
                        peer: peerUser.username,
                        count: 0,
                    });
                } else {
                    ctx.socket.to(sid).emit('dm_unread', {
                        peer: peerUser.username,
                        count: 0,
                    });
                }
            });
        }
    }

    /**
     * Handles 'typing' event.
     *
     * Broadcasts typing indicator to the target user.
     */
    @On('typing', TypingSchema)
    async onTyping(ctx: SocketContext, payload: z.infer<typeof TypingSchema>) {
        if (!ctx.user) return;
        const toSockets = this.presenceService.getSockets(payload.to);
        toSockets.forEach((sid) => {
            ctx.socket.to(sid).emit('typing', { from: ctx.user?.username });
        });
    }

    /**
     * Handles 'edit_message' event.
     *
     * Edits an existing message.
     * Verifies ownership before updating.
     */
    @On('edit_message', EditMessageSchema)
    async onEditMessage(
        ctx: SocketContext,
        payload: z.infer<typeof EditMessageSchema>,
    ) {
        const { messageId, text } = payload;
        if (!ctx.user) return { ok: false, error: 'Unauthorized' };
        const userId = ctx.user.id;

        const message = await this.messageRepo.findById(messageId);
        if (!message) return { ok: false, error: 'message not found' };

        if (message.senderId.toString() !== userId) {
            return { ok: false, error: 'unauthorized' };
        }

        const updated = await this.messageRepo.update(messageId, text);
        if (!updated) return { ok: false, error: 'failed to update message' };

        // Notify both
        const senderId = message.senderId.toString();
        const receiverId = message.receiverId.toString();

        const [senderUser, receiverUser] = await Promise.all([
            this.userRepo.findById(senderId),
            this.userRepo.findById(receiverId),
        ]);

        if (senderUser?.username && receiverUser?.username) {
            [senderUser.username, receiverUser.username].forEach((user) => {
                const sockets = this.presenceService.getSockets(user);
                sockets.forEach((sid) => {
                    if (sid === ctx.socket.id) {
                        ctx.socket.emit('message_edited', updated);
                    } else {
                        ctx.socket.to(sid).emit('message_edited', updated);
                    }
                });
            });
        }

        return { ok: true, message: updated };
    }

    /**
     * Handles 'delete_message' event.
     *
     * Deletes a message.
     * Verifies ownership before deleting.
     */
    @On('delete_message', DeleteMessageSchema)
    async onDeleteMessage(
        ctx: SocketContext,
        payload: z.infer<typeof DeleteMessageSchema>,
    ) {
        const { messageId } = payload;
        if (!ctx.user) return { ok: false, error: 'Unauthorized' };
        const userId = ctx.user.id;

        const message = await this.messageRepo.findById(messageId);
        if (!message) return { ok: false, error: 'message not found' };

        if (message.senderId.toString() !== userId) {
            return { ok: false, error: 'unauthorized' };
        }

        await this.messageRepo.delete(messageId);

        const senderId = message.senderId.toString();
        const receiverId = message.receiverId.toString();

        const [senderUser, receiverUser] = await Promise.all([
            this.userRepo.findById(senderId),
            this.userRepo.findById(receiverId),
        ]);

        if (senderUser?.username && receiverUser?.username) {
            [senderUser.username, receiverUser.username].forEach((user) => {
                const sockets = this.presenceService.getSockets(user);
                sockets.forEach((sid) => {
                    if (sid === ctx.socket.id) {
                        ctx.socket.emit('message_deleted', { messageId });
                    } else {
                        ctx.socket
                            .to(sid)
                            .emit('message_deleted', { messageId });
                    }
                });
            });
        }

        return { ok: true };
    }
}
