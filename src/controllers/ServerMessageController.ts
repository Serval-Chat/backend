import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Route,
    Body,
    Path,
    Query,
    Security,
    Response,
    Tags,
    Request,
} from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types';
import type {
    IServerMessageRepository,
    IServerMessage,
} from '../di/interfaces/IServerMessageRepository';
import type { IServerMemberRepository } from '../di/interfaces/IServerMemberRepository';
import type { IChannelRepository } from '../di/interfaces/IChannelRepository';
import type { IReactionRepository } from '../di/interfaces/IReactionRepository';
import { PermissionService } from '../services/PermissionService';
import type { ILogger } from '../di/interfaces/ILogger';
import { getIO } from '../socket';
import {
    messagesSentCounter,
    websocketMessagesCounter,
} from '../utils/metrics';
import express from 'express';
import mongoose from 'mongoose';
import { ErrorResponse } from './models/ErrorResponse';
import { ErrorMessages } from '../constants/errorMessages';

interface SendMessageRequest {
    text: string;
    replyToId?: string;
}

interface ServerEditMessageRequest {
    text: string;
}

/**
 * Controller for managing messages within server channels.
 * Enforces security via server membership and channel-specific permission checks.
 */
@injectable()
@Route('api/v1/servers/{serverId}/channels/{channelId}/messages')
@Tags('Server Messages')
@Security('jwt')
export class ServerMessageController extends Controller {
    constructor(
        @inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @inject(TYPES.ReactionRepository)
        private reactionRepo: IReactionRepository,
        @inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {
        super();
    }

    /**
     * Retrieves messages for a specific channel with pagination.
     * Enforces server membership.
     */
    @Get()
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NOT_MEMBER,
    })
    public async getMessages(
        @Path() serverId: string,
        @Path() channelId: string,
        @Request() req: express.Request,
        @Query() limit: number = 50,
        @Query() before?: string,
        @Query() around?: string,
    ): Promise<IServerMessage[]> {
        // @ts-ignore
        const userId = req.user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(403);
            throw new Error(ErrorMessages.SERVER.NOT_MEMBER);
        }

        // Fetch messages using cursor-based pagination (before / around)
        const msgs = await this.serverMessageRepo.findByChannelId(
            channelId,
            limit,
            before,
            around,
        );

        // Bulk fetch reactions for all retrieved messages
        const messageIds = msgs.map((m) => m._id.toString());
        const reactionsMap = await this.reactionRepo.getReactionsForMessages(
            messageIds,
            'server',
            userId,
        );

        return msgs.map((msg) => {
            const msgObj = (msg as any).toObject
                ? (msg as any).toObject()
                : msg;
            return {
                ...msgObj,
                reactions: reactionsMap[msg._id.toString()] || [],
            };
        });
    }

    /**
     * Sends a new message to a channel.
     * Enforces 'sendMessages' permission and updates channel activity.
     */
    @Post()
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: ErrorMessages.MESSAGE.TEXT_REQUIRED,
    })
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.CHANNEL.NO_PERMISSION_SEND,
    })
    public async sendMessage(
        @Path() serverId: string,
        @Path() channelId: string,
        @Request() req: express.Request,
        @Body() body: SendMessageRequest,
    ): Promise<IServerMessage> {
        // @ts-ignore
        const userId = req.user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(403);
            throw new Error(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const canSend = await this.permissionService.hasChannelPermission(
            serverId,
            userId,
            channelId,
            'sendMessages',
        );
        if (!canSend) {
            this.setStatus(403);
            throw new Error(ErrorMessages.CHANNEL.NO_PERMISSION_SEND);
        }

        const channel = await this.channelRepo.findById(channelId);
        if (!channel || channel.serverId.toString() !== serverId) {
            this.setStatus(404);
            throw new Error(ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const message = await this.serverMessageRepo.create({
            serverId: new mongoose.Types.ObjectId(serverId),
            channelId: new mongoose.Types.ObjectId(channelId),
            senderId: new mongoose.Types.ObjectId(userId),
            text: body.text.trim(),
            replyToId: body.replyToId
                ? new mongoose.Types.ObjectId(body.replyToId)
                : undefined,
        });

        // Update the channel's last activity timestamp for sorting and unread tracking
        await this.channelRepo.updateLastMessageAt(channelId);

        // Track message metrics for monitoring and scaling
        messagesSentCounter.labels('server').inc();
        websocketMessagesCounter.labels('server_message', 'outbound').inc();

        const io = getIO();
        io.to(`channel:${channelId}`).emit('server_message', message);

        // Notify all server members about new activity in this channel
        io.to(`server:${serverId}`).emit('channel_unread', {
            serverId,
            channelId,
            lastMessageAt: message.createdAt,
            senderId: userId,
        });

        return message;
    }

    /**
     * Retrieves a specific message and its replied-to message, if any.
     * Enforces server membership.
     */
    @Get('{messageId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NOT_MEMBER,
    })
    @Response<ErrorResponse>('404', 'Message Not Found', {
        error: ErrorMessages.MESSAGE.NOT_FOUND,
    })
    public async getMessage(
        @Path() serverId: string,
        @Path() channelId: string,
        @Path() messageId: string,
        @Request() req: express.Request,
    ): Promise<{
        message: IServerMessage;
        repliedMessage: IServerMessage | null;
    }> {
        // @ts-ignore
        const userId = req.user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(403);
            throw new Error(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const message = await this.serverMessageRepo.findById(messageId);
        if (!message || message.channelId.toString() !== channelId) {
            this.setStatus(404);
            throw new Error(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        let repliedMessage: IServerMessage | null = null;
        // Handle both legacy and new reply ID fields for backward compatibility
        if (message.replyToId) {
            const repliedMsg = await this.serverMessageRepo.findById(
                message.replyToId.toString(),
            );
            if (repliedMsg && repliedMsg.channelId.toString() === channelId) {
                repliedMessage = repliedMsg;
            }
        } else if (message.repliedToMessageId) {
            const repliedMsg = await this.serverMessageRepo.findById(
                message.repliedToMessageId.toString(),
            );
            if (repliedMsg && repliedMsg.channelId.toString() === channelId) {
                repliedMessage = repliedMsg;
            }
        }

        const reactions = await this.reactionRepo.getReactionsByMessage(
            messageId,
            'server',
            userId,
        );

        return {
            message: {
                ...((message as any).toObject
                    ? (message as any).toObject()
                    : message),
                reactions,
            },
            repliedMessage,
        };
    }

    /**
     * Edits an existing message.
     * Enforces that only the original sender can edit their message.
     */
    @Patch('{messageId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.MESSAGE.ONLY_SENDER_EDIT,
    })
    @Response<ErrorResponse>('404', 'Message Not Found', {
        error: ErrorMessages.MESSAGE.NOT_FOUND,
    })
    public async editMessage(
        @Path() serverId: string,
        @Path() channelId: string,
        @Path() messageId: string,
        @Request() req: express.Request,
        @Body() body: ServerEditMessageRequest,
    ): Promise<IServerMessage> {
        // @ts-ignore
        const userId = req.user.id;
        const message = await this.serverMessageRepo.findById(messageId);
        if (!message || message.channelId.toString() !== channelId) {
            this.setStatus(404);
            throw new Error(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        if (message.senderId.toString() !== userId) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MESSAGE.ONLY_SENDER_EDIT);
        }

        const updatedMessage = await this.serverMessageRepo.update(messageId, {
            text: body.text.trim(),
            // Mark message as edited for client-side rendering
            isEdited: true,
        });
        if (!updatedMessage) {
            this.setStatus(404);
            throw new Error(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        const io = getIO();
        io.to(`channel:${channelId}`).emit(
            'server_message_updated',
            updatedMessage,
        );

        return updatedMessage;
    }

    /**
     * Deletes a message.
     * Enforces that either the sender or a user with 'manageMessages' permission can delete.
     */
    @Delete('{messageId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.MESSAGE.NO_PERMISSION_DELETE,
    })
    @Response<ErrorResponse>('404', 'Message Not Found', {
        error: ErrorMessages.MESSAGE.NOT_FOUND,
    })
    public async deleteMessage(
        @Path() serverId: string,
        @Path() channelId: string,
        @Path() messageId: string,
        @Request() req: express.Request,
    ): Promise<{ message: string }> {
        // @ts-ignore
        const userId = req.user.id;
        const message = await this.serverMessageRepo.findById(messageId);
        if (!message || message.channelId.toString() !== channelId) {
            this.setStatus(404);
            throw new Error(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        const canManage = await this.permissionService.hasChannelPermission(
            serverId,
            userId,
            channelId,
            'manageMessages',
        );
        if (message.senderId.toString() !== userId && !canManage) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MESSAGE.NO_PERMISSION_DELETE);
        }

        await this.serverMessageRepo.delete(messageId);

        const io = getIO();
        io.to(`channel:${channelId}`).emit('server_message_deleted', {
            messageId,
            channelId,
        });

        return { message: 'Message deleted' };
    }
}
