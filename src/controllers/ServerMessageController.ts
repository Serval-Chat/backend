import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Req,
    Inject,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiQuery,
} from '@nestjs/swagger';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type {
    IServerMessageRepository,
    IServerMessage,
} from '@/di/interfaces/IServerMessageRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { IReactionRepository } from '@/di/interfaces/IReactionRepository';
import { PermissionService } from '@/services/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import type {
    IMessageServerEvent,
    IChannelUnreadUpdatedEvent,
    IMessageServerEditedEvent,
    IMessageServerDeletedEvent,
} from '@/ws/protocol/events/messages';
import { messagesSentCounter, websocketMessagesCounter } from '@/utils/metrics';
import type { Request as ExpressRequest } from 'express';
import { JWTPayload } from '@/utils/jwt';
import mongoose from 'mongoose';
import { ErrorMessages } from '@/constants/errorMessages';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import {
    SendMessageRequestDTO,
    ServerEditMessageRequestDTO,
} from './dto/server-message.request.dto';

// Controller for managing messages within server channels
// Enforces server membership and channel-specific permission checks
@injectable()
@Controller('api/v1/servers/:serverId/channels/:channelId/messages')
@ApiTags('Server Messages')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ServerMessageController {
    constructor(
        @inject(TYPES.ServerMessageRepository)
        @Inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @inject(TYPES.ServerMemberRepository)
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.ChannelRepository)
        @Inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @inject(TYPES.ReactionRepository)
        @Inject(TYPES.ReactionRepository)
        private reactionRepo: IReactionRepository,
        @inject(TYPES.PermissionService)
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @inject(TYPES.WsServer)
        @Inject(TYPES.WsServer)
        private wsServer: IWsServer,
    ) { }

    // Retrieves messages for a specific channel with pagination
    // Enforces server membership
    @Get()
    @ApiOperation({ summary: 'Get channel messages' })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'before', required: false, type: String })
    @ApiQuery({ name: 'around', required: false, type: String })
    @ApiResponse({ status: 200, description: 'Messages retrieved' })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    public async getMessages(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Req() req: ExpressRequest,
        @Query('limit') limit: number = 50,
        @Query('before') before?: string,
        @Query('around') around?: string,
    ): Promise<IServerMessage[]> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
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
            const msgObj =
                'toObject' in msg && typeof msg.toObject === 'function'
                    ? msg.toObject()
                    : msg;
            return {
                ...msgObj,
                reactions:
                    (reactionsMap as Record<string, unknown[]>)[
                    msg._id.toString()
                    ] || [],
            };
        });
    }

    // Sends a new message to a channel
    // Enforces 'sendMessages' permission and updates channel activity
    @Post()
    @ApiOperation({ summary: 'Send a message' })
    @ApiResponse({ status: 201, description: 'Message sent' })
    @ApiResponse({
        status: 400,
        description: ErrorMessages.MESSAGE.TEXT_REQUIRED,
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.CHANNEL.NO_PERMISSION_SEND,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.CHANNEL.NOT_FOUND })
    public async sendMessage(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Req() req: ExpressRequest,
        @Body() body: SendMessageRequestDTO,
    ): Promise<IServerMessage> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const canSend = await this.permissionService.hasChannelPermission(
            serverId,
            userId,
            channelId,
            'sendMessages',
        );
        if (!canSend) {
            throw new ForbiddenException(
                ErrorMessages.CHANNEL.NO_PERMISSION_SEND,
            );
        }

        const channel = await this.channelRepo.findById(channelId);
        if (!channel || channel.serverId.toString() !== serverId) {
            throw new NotFoundException(ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const messageText = (body.content || body.text || '').trim();
        if (!messageText) {
            throw new BadRequestException(ErrorMessages.MESSAGE.TEXT_REQUIRED);
        }

        const message = await this.serverMessageRepo.create({
            serverId: new mongoose.Types.ObjectId(serverId),
            channelId: new mongoose.Types.ObjectId(channelId),
            senderId: new mongoose.Types.ObjectId(userId),
            text: messageText,
            repliedToMessageId: body.replyToId
                ? new mongoose.Types.ObjectId(body.replyToId)
                : undefined,
        });

        // Update the channel's last activity timestamp for sorting and unread tracking
        await this.channelRepo.updateLastMessageAt(channelId);

        // Track message metrics
        messagesSentCounter.labels('server').inc();
        websocketMessagesCounter.labels('server_message', 'outbound').inc();

        const messagePayload: IMessageServerEvent = {
            type: 'message_server',
            payload: {
                messageId: message._id.toString(),
                serverId: serverId,
                channelId: channelId,
                senderId: userId,
                senderUsername: (req as ExpressRequest & { user: JWTPayload })
                    .user.username,
                text: messageText,
                createdAt:
                    message.createdAt instanceof Date
                        ? message.createdAt.toISOString()
                        : new Date().toISOString(),
                replyToId: message.repliedToMessageId?.toString(),
                isEdited: false,
                isWebhook: message.isWebhook || false,
                webhookUsername: message.webhookUsername,
                webhookAvatarUrl: message.webhookAvatarUrl,
            },
        };
        this.wsServer.broadcastToChannel(channelId, messagePayload);

        // Notify all server members about new activity in this channel
        const unreadPayload: IChannelUnreadUpdatedEvent = {
            type: 'channel_unread_updated',
            payload: {
                serverId,
                channelId,
                lastMessageAt:
                    message.createdAt instanceof Date
                        ? message.createdAt.toISOString()
                        : new Date().toISOString(),
                senderId: userId,
            },
        };
        this.wsServer.broadcastToServer(serverId, unreadPayload);

        return message;
    }

    // Retrieves a specific message and its replied-to message, if any
    // Enforces server membership
    @Get(':messageId')
    @ApiOperation({ summary: 'Get a message' })
    @ApiResponse({ status: 200, description: 'Message retrieved' })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    @ApiResponse({ status: 404, description: ErrorMessages.MESSAGE.NOT_FOUND })
    public async getMessage(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('messageId') messageId: string,
        @Req() req: ExpressRequest,
    ): Promise<{
        message: IServerMessage;
        repliedMessage: IServerMessage | null;
    }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const message = await this.serverMessageRepo.findById(messageId);
        if (!message || message.channelId.toString() !== channelId) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
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
                ...('toObject' in message &&
                    typeof message.toObject === 'function'
                    ? message.toObject()
                    : message),
                reactions,
            },
            repliedMessage,
        };
    }

    // Edits an existing message
    // Enforces that only the original sender can edit their message
    @Patch(':messageId')
    @ApiOperation({ summary: 'Edit a message' })
    @ApiResponse({ status: 200, description: 'Message updated' })
    @ApiResponse({
        status: 400,
        description: ErrorMessages.MESSAGE.TEXT_REQUIRED,
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MESSAGE.ONLY_SENDER_EDIT,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.MESSAGE.NOT_FOUND })
    public async editMessage(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('messageId') messageId: string,
        @Req() req: ExpressRequest,
        @Body() body: ServerEditMessageRequestDTO,
    ): Promise<IServerMessage> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const message = await this.serverMessageRepo.findById(messageId);
        if (!message || message.channelId.toString() !== channelId) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        if (message.senderId.toString() !== userId) {
            throw new ForbiddenException(
                ErrorMessages.MESSAGE.ONLY_SENDER_EDIT,
            );
        }

        const messageText = (body.content || body.text || '').trim();
        if (!messageText) {
            throw new BadRequestException(ErrorMessages.MESSAGE.TEXT_REQUIRED);
        }

        const updatedMessage = await this.serverMessageRepo.update(messageId, {
            text: messageText,
            // Mark message as edited for client-side rendering
            isEdited: true,
        });
        if (!updatedMessage) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        const event: IMessageServerEditedEvent = {
            type: 'message_server_edited',
            payload: {
                messageId,
                serverId,
                channelId,
                text: messageText,
                editedAt: new Date().toISOString(),
                isEdited: true,
            },
        };
        this.wsServer.broadcastToChannel(channelId, event);

        return updatedMessage;
    }

    // Deletes a message
    // Enforces that either the sender or a user with 'manageMessages' permission can delete
    @Delete(':messageId')
    @ApiOperation({ summary: 'Delete a message' })
    @ApiResponse({ status: 200, description: 'Message deleted' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MESSAGE.NO_PERMISSION_DELETE,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.MESSAGE.NOT_FOUND })
    public async deleteMessage(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('messageId') messageId: string,
        @Req() req: ExpressRequest,
    ): Promise<{ message: string }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const message = await this.serverMessageRepo.findById(messageId);
        if (!message || message.channelId.toString() !== channelId) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        const canManage = await this.permissionService.hasChannelPermission(
            serverId,
            userId,
            channelId,
            'manageMessages',
        );
        if (!canManage && message.senderId.toString() !== userId) {
            throw new ForbiddenException(
                ErrorMessages.MESSAGE.NO_PERMISSION_DELETE,
            );
        }

        await this.serverMessageRepo.delete(messageId);

        const event: IMessageServerDeletedEvent = {
            type: 'message_server_deleted',
            payload: {
                messageId,
                channelId,
            },
        };
        this.wsServer.broadcastToChannel(channelId, event);

        return { message: 'Message deleted' };
    }
}
