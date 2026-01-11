import { injectable, inject } from 'inversify';
import {
    WsController,
    Event,
    NeedAuth,
    Validate,
    RateLimit,
    Dedup,
    Timeout,
} from '@/ws/decorators';
import type { WebSocket } from 'ws';
import {
    SendMessageDmSchema,
    EditMessageDmSchema,
    DeleteMessageDmSchema,
    MarkDmReadSchema,
    TypingDmSchema,
} from '@/validation/schemas/ws/messages.schema';
import type {
    ISendMessageDmEvent,
    IMessageDmSentEvent,
    IMessageDmEvent,
    IEditMessageDmEvent,
    IMessageDmEditedEvent,
    IDeleteMessageDmEvent,
    IMarkDmReadEvent,
    IDmUnreadUpdatedEvent,
    ITypingDmEvent,
    ITypingDmBroadcastEvent,
} from '@/ws/protocol/events/messages';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IMessageRepository } from '@/di/interfaces/IMessageRepository';
import type { IDmUnreadRepository } from '@/di/interfaces/IDmUnreadRepository';
import type { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import type { IWsUser } from '@/ws/types';
import logger from '@/utils/logger';
import type { TransactionManager } from '@/infrastructure/TransactionManager';

/**
 * Controller for handling direct message events
 */
@injectable()
@WsController()
export class ChatController {
    @inject(TYPES.WsServer) private wsServer!: IWsServer;

    constructor(
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @inject(TYPES.DmUnreadRepository)
        private dmUnreadRepo: IDmUnreadRepository,
        @inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
        @inject(TYPES.TransactionManager)
        private transactionManager: TransactionManager,
    ) { }

    /**
     * Handles 'send_message_dm' event.
     */
    @Event('send_message_dm')
    @NeedAuth()
    @Validate(SendMessageDmSchema)
    @RateLimit(10, 1000) // 10 messages per second
    @Dedup()
    @Timeout(5000)
    public async onSendMessageDm(
        payload: ISendMessageDmEvent['payload'],
        authenticatedUser?: IWsUser,
        ws?: WebSocket,
    ): Promise<IMessageDmSentEvent['payload']> {
        if (!authenticatedUser) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const { receiverId, text, replyToId } = payload;
        const senderId = authenticatedUser.userId;

        const receiverUser = await this.userRepo.findById(receiverId);
        if (!receiverUser) {
            throw new Error('NOT_FOUND: Receiver not found');
        }

        const receiverUsername = receiverUser.username || '';

        if (!(await this.friendshipRepo.areFriends(senderId, receiverId))) {
            throw new Error('FORBIDDEN: Not friends with receiver');
        }

        if (senderId === receiverId) {
            throw new Error('FORBIDDEN: Cannot message yourself');
        }

        let repliedToMessage = null;
        if (replyToId) {
            repliedToMessage = await this.messageRepo.findById(replyToId);
        }

        const { created, newCount } =
            await this.transactionManager.runInTransaction(async (session) => {
                const msg = await this.messageRepo.create(
                    {
                        senderId,
                        receiverId,
                        text,
                        ...(replyToId ? { replyToId } : {}),
                    },
                    session,
                );

                logger.info(
                    `[ChatController] DM sent from ${senderId} to ${receiverId}`,
                );

                const count = await this.dmUnreadRepo.increment(
                    receiverId,
                    senderId,
                    session,
                );

                return { created: msg, newCount: count };
            });

        const broadcastPayload: IMessageDmEvent['payload'] = {
            messageId: created._id.toString(),
            senderId,
            senderUsername: authenticatedUser.username,
            receiverId,
            receiverUsername,
            text: created.text,
            createdAt:
                created.createdAt?.toISOString() || new Date().toISOString(),
            replyToId: created.replyToId,
            repliedTo: repliedToMessage
                ? {
                    messageId: repliedToMessage._id.toString(),
                    senderId: repliedToMessage.senderId.toString(),
                    senderUsername: '', // Will be populated in broadcast
                    text: repliedToMessage.text,
                }
                : undefined,
            isEdited: false,
        };

        this.wsServer.broadcastToUser(
            senderId,
            {
                type: 'message_dm',
                payload: broadcastPayload,
            },
            undefined,
            ws,
        );

        this.wsServer.broadcastToUser(receiverId, {
            type: 'message_dm',
            payload: broadcastPayload,
        });

        const unreadPayload: IDmUnreadUpdatedEvent['payload'] = {
            peerId: senderId,
            peerUsername: authenticatedUser.username,
            count: newCount,
        };

        this.wsServer.broadcastToUser(receiverId, {
            type: 'dm_unread_updated',
            payload: unreadPayload,
        });

        return {
            messageId: created._id.toString(),
            senderId,
            receiverId,
            text: created.text,
            createdAt:
                created.createdAt?.toISOString() || new Date().toISOString(),
            replyToId: created.replyToId,
            repliedTo: repliedToMessage
                ? {
                    messageId: repliedToMessage._id.toString(),
                    senderId: repliedToMessage.senderId.toString(),
                    text: repliedToMessage.text,
                }
                : undefined,
        };
    }

    /**
     * Handles 'edit_message_dm' event.
     */
    @Event('edit_message_dm')
    @NeedAuth()
    @Validate(EditMessageDmSchema)
    public async onEditMessageDm(
        payload: IEditMessageDmEvent['payload'],
        authenticatedUser?: IWsUser,
        ws?: WebSocket,
    ): Promise<IMessageDmEditedEvent['payload']> {
        if (!authenticatedUser) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const { messageId, text } = payload;
        const userId = authenticatedUser.userId;

        const message = await this.messageRepo.findById(messageId);
        if (!message) {
            throw new Error('NOT_FOUND: Message not found');
        }

        if (message.senderId.toString() !== userId) {
            throw new Error('FORBIDDEN: Can only edit your own messages');
        }

        const updated = await this.messageRepo.update(messageId, text);
        if (!updated) {
            throw new Error('INTERNAL_ERROR: Failed to update message');
        }

        logger.info(
            `[ChatController] DM message ${messageId} edited by ${userId}`,
        );

        const senderId = message.senderId.toString();
        const receiverId = message.receiverId.toString();

        const broadcastPayload: IMessageDmEditedEvent['payload'] = {
            messageId,
            text: updated.text,
            editedAt:
                updated.editedAt?.toISOString() || new Date().toISOString(),
            isEdited: true,
        };

        this.wsServer.broadcastToUser(
            senderId,
            {
                type: 'message_dm_edited',
                payload: broadcastPayload,
            },
            undefined,
            ws,
        );

        this.wsServer.broadcastToUser(receiverId, {
            type: 'message_dm_edited',
            payload: broadcastPayload,
        });

        return broadcastPayload;
    }

    /**
     * Handles 'delete_message_dm' event.
     */
    @Event('delete_message_dm')
    @NeedAuth()
    @Validate(DeleteMessageDmSchema)
    public async onDeleteMessageDm(
        payload: IDeleteMessageDmEvent['payload'],
        authenticatedUser?: IWsUser,
        ws?: WebSocket,
    ): Promise<{ success: boolean }> {
        if (!authenticatedUser) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const { messageId } = payload;
        const userId = authenticatedUser.userId;

        const message = await this.messageRepo.findById(messageId);
        if (!message) {
            throw new Error('NOT_FOUND: Message not found');
        }

        if (message.senderId.toString() !== userId) {
            throw new Error('FORBIDDEN: Can only delete your own messages');
        }

        await this.messageRepo.delete(messageId);

        logger.info(
            `[ChatController] DM message ${messageId} deleted by ${userId}`,
        );

        const senderId = message.senderId.toString();
        const receiverId = message.receiverId.toString();

        this.wsServer.broadcastToUser(
            senderId,
            {
                type: 'message_dm_deleted',
                payload: { messageId },
            },
            undefined,
            ws,
        );

        this.wsServer.broadcastToUser(receiverId, {
            type: 'message_dm_deleted',
            payload: { messageId },
        });

        return { success: true };
    }

    /**
     * Handles 'mark_dm_read' event.
     *
     * Marks a DM conversation as read, resetting the unread count to 0.
     */
    @Event('mark_dm_read')
    @NeedAuth()
    @Validate(MarkDmReadSchema)
    public async onMarkDmRead(
        payload: IMarkDmReadEvent['payload'],
        authenticatedUser?: IWsUser,
    ): Promise<{ success: boolean }> {
        if (!authenticatedUser) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const { peerId } = payload;
        const userId = authenticatedUser.userId;

        // Reset unread count
        await this.dmUnreadRepo.reset(userId, peerId);

        // Get peer username for broadcast
        const peerUser = await this.userRepo.findById(peerId);
        const peerUsername = peerUser?.username || '';

        logger.debug(
            `[ChatController] User ${userId} marked DM with ${peerId} as read`,
        );

        // Broadcast to all user's sessions
        const unreadPayload: IDmUnreadUpdatedEvent['payload'] = {
            peerId,
            peerUsername,
            count: 0,
        };

        this.wsServer.broadcastToUser(userId, {
            type: 'dm_unread_updated',
            payload: unreadPayload,
        });

        return { success: true };
    }

    /**
     * Handles 'typing_dm' event.
     */
    @Event('typing_dm')
    @NeedAuth()
    @Validate(TypingDmSchema)
    @RateLimit(100, 1000) // Allow 100 typing events per second
    public async onTypingDm(
        payload: ITypingDmEvent['payload'],
        authenticatedUser?: IWsUser,
    ): Promise<void> {
        if (!authenticatedUser) {
            return;
        }

        const { receiverId } = payload;
        const senderId = authenticatedUser.userId;

        if (!(await this.friendshipRepo.areFriends(senderId, receiverId))) {
            return;
        }

        const typingPayload: ITypingDmBroadcastEvent['payload'] = {
            senderId: authenticatedUser.userId,
            senderUsername: authenticatedUser.username,
        };

        this.wsServer.broadcastToUser(receiverId, {
            type: 'typing_dm',
            payload: typingPayload,
        });
    }
}
