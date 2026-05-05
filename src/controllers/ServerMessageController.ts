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
import { injectable } from 'inversify';
import { TYPES } from '@/di/types';
import type {
    IServerMessageRepository,
    IServerMessage,
} from '@/di/interfaces/IServerMessageRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { IReactionRepository } from '@/di/interfaces/IReactionRepository';
import type { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import { PermissionService } from '@/permissions/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import type {
    IMessageServerEvent,
    IChannelUnreadUpdatedEvent,
    IMessageServerEditedEvent,
    IMessageServerPinUpdatedEvent,
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
    BulkDeleteMessagesRequestDTO,
} from './dto/server-message.request.dto';

@injectable()
@Controller('api/v1/servers/:serverId/channels/:channelId/messages')
@ApiTags('Server Messages')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ServerMessageController {
    public constructor(
        @Inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @Inject(TYPES.ReactionRepository)
        private reactionRepo: IReactionRepository,
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @Inject(TYPES.WsServer)
        private wsServer: IWsServer,
        @Inject(TYPES.AuditLogRepository)
        private auditLogRepo: IAuditLogRepository,
        @Inject(TYPES.ServerAuditLogService)
        private serverAuditLogService: IServerAuditLogService,
        @Inject(TYPES.ServerRepository)
        private serverRepo: IServerRepository,
    ) { }

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
        @Query('after') after?: string,
    ): Promise<IServerMessage[]> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const channel = await this.channelRepo.findById(
            new mongoose.Types.ObjectId(channelId),
        );
        if (channel === null || channel.serverId.toString() !== serverId) {
            throw new NotFoundException(ErrorMessages.CHANNEL.NOT_FOUND);
        }
        if (channel.type === 'link') {
            throw new ForbiddenException(
                'Cannot read messages from a link channel',
            );
        }

        const canView = await this.permissionService.hasChannelPermission(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
            new mongoose.Types.ObjectId(channelId),
            'viewChannels',
        );
        if (canView !== true) {
            throw new ForbiddenException(ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const includeDeleted = await this.permissionService.hasChannelPermission(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
            new mongoose.Types.ObjectId(channelId),
            'seeDeletedMessages',
        );

        const msgs = await this.serverMessageRepo.findByChannelId(
            new mongoose.Types.ObjectId(channelId),
            limit,
            before,
            around,
            after,
            includeDeleted,
        );

        const messageIds = msgs.map((m) => m._id);
        const reactionsMap = await this.reactionRepo.getReactionsForMessages(
            messageIds,
            'server',
            new mongoose.Types.ObjectId(userId),
        );

        return msgs.map((msg) => {
            const msgObj = msg as unknown as Record<string, unknown>;
            return {
                ...msgObj,
                reactions:
                    (reactionsMap as Record<string, unknown[]>)[
                    msg._id.toString()
                    ] || [],
            } as IServerMessage;
        });
    }

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
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const server = await this.serverRepo.findById(new mongoose.Types.ObjectId(serverId));
        const isOwner = server !== null && server.ownerId.toString() === userId;

        if (isOwner === false && (member.communicationDisabledUntil !== undefined) && new Date(member.communicationDisabledUntil) > new Date()) {
            throw new ForbiddenException(`You are timed out until ${new Date(member.communicationDisabledUntil).toISOString()}. You cannot send messages.`);
        }

        const canSend = await this.permissionService.hasChannelPermission(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
            new mongoose.Types.ObjectId(channelId),
            'sendMessages',
        );
        if (canSend !== true) {
            throw new ForbiddenException(
                ErrorMessages.CHANNEL.NO_PERMISSION_SEND,
            );
        }

        const channel = await this.channelRepo.findById(
            new mongoose.Types.ObjectId(channelId),
        );
        if (channel === null || channel.serverId.toString() !== serverId) {
            throw new NotFoundException(ErrorMessages.CHANNEL.NOT_FOUND);
        }
        if (channel.type === 'link') {
            throw new ForbiddenException(
                'Cannot send messages to a link channel via API',
            );
        }

        // Check for slow mode
        if ((channel.slowMode !== undefined) && channel.slowMode > 0) {
            const hasBypass = await this.permissionService.hasChannelPermission(
                new mongoose.Types.ObjectId(serverId),
                new mongoose.Types.ObjectId(userId),
                new mongoose.Types.ObjectId(channelId),
                'bypassSlowmode',
            );

            if (hasBypass !== true) {
                const lastMessage =
                    await this.serverMessageRepo.findLastByChannelAndUser(
                        new mongoose.Types.ObjectId(channelId),
                        new mongoose.Types.ObjectId(userId),
                    );

                if (lastMessage !== null) {
                    const now = new Date();
                    const lastSentAt =
                        lastMessage.createdAt instanceof Date
                            ? lastMessage.createdAt
                            : new Date(lastMessage.createdAt);
                    const elapsedSeconds = Math.floor(
                        (now.getTime() - lastSentAt.getTime()) / 1000,
                    );

                    if (elapsedSeconds < channel.slowMode) {
                        const remaining = channel.slowMode - elapsedSeconds;
                        throw new ForbiddenException(
                            ErrorMessages.MESSAGE.SLOW_MODE.replace(
                                '%s',
                                `${remaining}s`,
                            ),
                        );
                    }
                }
            }
        }

        const messageText = (body.content ?? body.text ?? '').trim();
        const embeds = body.embeds;

        if ((embeds !== undefined) && embeds.length > 0) {
            const isBot = (req as ExpressRequest & { user: JWTPayload }).user.isBot === true;
            if (isBot === false) {
                throw new ForbiddenException('Only bots can send messages with rich embeds');
            }
        }

        if ((messageText === '') && ((embeds === undefined) || embeds.length === 0)) {
            throw new BadRequestException(ErrorMessages.MESSAGE.TEXT_REQUIRED);
        }


        const message = await this.serverMessageRepo.create({
            serverId: new mongoose.Types.ObjectId(serverId),
            channelId: new mongoose.Types.ObjectId(channelId),
            senderId: new mongoose.Types.ObjectId(userId),
            text: messageText,
            repliedToMessageId: (body.replyToId !== undefined && body.replyToId !== '')
                ? new mongoose.Types.ObjectId(body.replyToId)
                : undefined,
            embeds,
            interaction: body.interaction,
            stickerId: (body.stickerId !== undefined && body.stickerId !== '')
                ? new mongoose.Types.ObjectId(body.stickerId)
                : undefined,
        });

        await this.channelRepo.updateLastMessageAt(
            new mongoose.Types.ObjectId(channelId),
        );

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
                isPinned: message.isPinned ?? false,
                isSticky: message.isSticky ?? false,
                isWebhook: message.isWebhook ?? false,
                webhookUsername: message.webhookUsername,
                webhookAvatarUrl: message.webhookAvatarUrl,
                embeds: message.embeds || [],
                interaction: (message.interaction?.command !== undefined && message.interaction.command !== '') ? message.interaction : undefined,
                stickerId: message.stickerId?.toString(),
            },
        };
        this.wsServer.broadcastToChannel(channelId, messagePayload);

        await this.wsServer.broadcastToServerWithPermission(
            serverId,
            messagePayload,
            {
                type: 'channel',
                targetId: channelId,
                permission: 'viewChannels',
            },
            undefined,
            undefined,
            { onlyBots: true },
        );

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
        this.wsServer.broadcastToServer(serverId, unreadPayload, undefined, undefined, {
            excludeBots: true,
        });

        return message;
    }

    @Get('pins')
    @ApiOperation({ summary: 'Get all pinned messages' })
    @ApiResponse({ status: 200, description: 'Pinned messages retrieved' })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    public async getPinnedMessages(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Req() req: ExpressRequest,
    ): Promise<IServerMessage[]> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const canView = await this.permissionService.hasChannelPermission(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
            new mongoose.Types.ObjectId(channelId),
            'viewChannels',
        );
        if (canView !== true) {
            throw new ForbiddenException(ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const includeDeleted = await this.permissionService.hasChannelPermission(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
            new mongoose.Types.ObjectId(channelId),
            'seeDeletedMessages',
        );

        const pins = await this.serverMessageRepo.findPinnedByChannelId(
            new mongoose.Types.ObjectId(channelId),
            includeDeleted,
        );

        const pinIds = pins.map((p) => p._id);
        if (pinIds.length === 0) return [];

        const reactionsMap = await this.reactionRepo.getReactionsForMessages(
            pinIds,
            'server',
            new mongoose.Types.ObjectId(userId),
        );

        return pins.map((pin) => ({
            ...pin,
            reactions:
                (reactionsMap as Record<string, unknown[]>)[
                pin._id.toString()
                ] || [],
        })) as unknown as IServerMessage[];
    }

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
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const channel = await this.channelRepo.findById(
            new mongoose.Types.ObjectId(channelId),
        );
        if (channel === null || channel.serverId.toString() !== serverId) {
            throw new NotFoundException(ErrorMessages.CHANNEL.NOT_FOUND);
        }
        if (channel.type === 'link') {
            throw new ForbiddenException(
                'Cannot read a message from a link channel',
            );
        }

        const canView = await this.permissionService.hasChannelPermission(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
            new mongoose.Types.ObjectId(channelId),
            'viewChannels',
        );
        if (canView !== true) {
            throw new ForbiddenException(ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const includeDeleted = await this.permissionService.hasChannelPermission(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
            new mongoose.Types.ObjectId(channelId),
            'seeDeletedMessages',
        );

        const message = await this.serverMessageRepo.findById(
            new mongoose.Types.ObjectId(messageId),
            includeDeleted,
        );
        if (message === null || message.channelId.toString() !== channelId) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        let repliedMessage: IServerMessage | null = null;
        // Handle both legacy and new reply ID fields for backward compatibility
        if (message.replyToId) {
            const repliedMsg = await this.serverMessageRepo.findById(
                message.replyToId,
                includeDeleted,
            );
            if (repliedMsg !== null && repliedMsg.channelId.toString() === channelId) {
                repliedMessage = repliedMsg;
            }
        } else if (message.repliedToMessageId) {
            const repliedMsg = await this.serverMessageRepo.findById(
                message.repliedToMessageId,
                includeDeleted,
            );
            if (repliedMsg !== null && repliedMsg.channelId.toString() === channelId) {
                repliedMessage = repliedMsg;
            }
        }

        const reactions = await this.reactionRepo.getReactionsByMessage(
            new mongoose.Types.ObjectId(messageId),
            'server',
            new mongoose.Types.ObjectId(userId),
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
        const message = await this.serverMessageRepo.findById(
            new mongoose.Types.ObjectId(messageId),
            true,
        );
        if (message === null || message.channelId.toString() !== channelId) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        if (message.deletedAt) {
            throw new BadRequestException("Cannot edit a deleted message");
        }

        if (message.senderId.toString() !== userId) {
            throw new ForbiddenException(
                ErrorMessages.MESSAGE.ONLY_SENDER_EDIT,
            );
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
        );

        const serverObj = await this.serverRepo.findById(new mongoose.Types.ObjectId(serverId));
        const isOwner = serverObj !== null && serverObj.ownerId.toString() === userId;

        if (isOwner === false && (member !== null) && (member.communicationDisabledUntil !== undefined) && new Date(member.communicationDisabledUntil) > new Date()) {
            throw new ForbiddenException("You cannot edit messages while timed out.");
        }

        const messageText = (body.content ?? body.text ?? '').trim();
        if (messageText === '') {
            throw new BadRequestException(ErrorMessages.MESSAGE.TEXT_REQUIRED);
        }

        const updatedMessage = await this.serverMessageRepo.update(
            new mongoose.Types.ObjectId(messageId),
            {
                text: messageText,
                isEdited: true,
                editedAt: new Date(),
            },
        );
        if (updatedMessage === null) {
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

        await this.wsServer.broadcastToServerWithPermission(
            serverId,
            event,
            {
                type: 'channel',
                targetId: channelId,
                permission: 'viewChannels',
            },
            undefined,
            undefined,
            { onlyBots: true },
        );

        const channelObj = await this.channelRepo.findById(
            new mongoose.Types.ObjectId(channelId),
        );

        await this.serverAuditLogService.createAndBroadcast({
            serverId: new mongoose.Types.ObjectId(serverId),
            actorId: new mongoose.Types.ObjectId(userId),
            actionType: 'edit_message',
            targetId: message._id,
            targetType: 'message',
            targetUserId: message.senderId,
            changes: [
                {
                    field: 'text',
                    before: message.text,
                    after: messageText,
                },
            ],
            metadata: {
                channelId: message.channelId.toString(),
                channelName: channelObj ? channelObj.name : 'Unknown Channel',
            },
        });

        return updatedMessage;
    }

    @Delete('bulk-delete')
    @ApiOperation({ summary: 'Bulk delete messages' })
    @ApiResponse({ status: 200, description: 'Messages deleted' })
    public async bulkDeleteMessages(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Body() body: BulkDeleteMessagesRequestDTO,
        @Req() req: ExpressRequest,
    ): Promise<{ message: string; deletedCount: number }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;

        const canManage = await this.permissionService.hasChannelPermission(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
            new mongoose.Types.ObjectId(channelId),
            'manageMessages',
        );
        const canDeleteOthers =
            await this.permissionService.hasChannelPermission(
                new mongoose.Types.ObjectId(serverId),
                new mongoose.Types.ObjectId(userId),
                new mongoose.Types.ObjectId(channelId),
                'deleteMessagesOfOthers',
            );

        if (canManage !== true && canDeleteOthers !== true) {
            throw new ForbiddenException(
                ErrorMessages.MESSAGE.NO_PERMISSION_DELETE,
            );
        }

        const objectIds = body.messageIds.map(
            (id) => new mongoose.Types.ObjectId(id),
        );
        const deletedCount = await this.serverMessageRepo.bulkDelete(
            new mongoose.Types.ObjectId(channelId),
            objectIds,
        );

        await this.wsServer.broadcastToServerWithPermission(
            serverId,
            {
                type: 'messages_server_bulk_deleted',
                payload: { messageIds: body.messageIds, serverId, channelId, hard: true },
            },
            {
                type: 'channel',
                targetId: channelId,
                permission: 'seeDeletedMessages',
                negate: true,
            },
        );

        await this.wsServer.broadcastToServerWithPermission(
            serverId,
            {
                type: 'messages_server_bulk_deleted',
                payload: { messageIds: body.messageIds, serverId, channelId, hard: false },
            },
            {
                type: 'channel',
                targetId: channelId,
                permission: 'seeDeletedMessages',
                negate: false,
            },
        );

        await this.wsServer.broadcastToServerWithPermission(
            serverId,
            {
                type: 'messages_server_bulk_deleted',
                payload: { messageIds: body.messageIds, serverId, channelId, hard: true },
            },
            {
                type: 'channel',
                targetId: channelId,
                permission: 'viewChannels',
            },
            undefined,
            undefined,
            { onlyBots: true },
        );

        return { message: 'Messages deleted', deletedCount };
    }

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
        const message = await this.serverMessageRepo.findById(
            new mongoose.Types.ObjectId(messageId),
            true,
        );
        if (message === null || message.channelId.toString() !== channelId) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        if (message.deletedAt) {
            return { message: "Message deleted" };
        }

        const channel = await this.channelRepo.findById(
            new mongoose.Types.ObjectId(channelId),
        );
        if (channel === null) {
            throw new NotFoundException(ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const canManage = await this.permissionService.hasChannelPermission(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
            new mongoose.Types.ObjectId(channelId),
            'manageMessages',
        );
        const canDeleteOthers =
            await this.permissionService.hasChannelPermission(
                new mongoose.Types.ObjectId(serverId),
                new mongoose.Types.ObjectId(userId),
                new mongoose.Types.ObjectId(channelId),
                'deleteMessagesOfOthers',
            );

        if (
            canManage !== true &&
            canDeleteOthers !== true &&
            message.senderId.toString() !== userId
        ) {
            throw new ForbiddenException(
                ErrorMessages.MESSAGE.NO_PERMISSION_DELETE,
            );
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
        );
        const serverObj = await this.serverRepo.findById(new mongoose.Types.ObjectId(serverId));
        const isOwner = serverObj !== null && serverObj.ownerId.toString() === userId;

        if (isOwner === false && (member !== null) && (member.communicationDisabledUntil !== undefined) && new Date(member.communicationDisabledUntil) > new Date()) {
            throw new ForbiddenException("You cannot delete messages while timed out.");
        }

        await this.serverMessageRepo.delete(
            new mongoose.Types.ObjectId(messageId),
        );

        await this.wsServer.broadcastToServerWithPermission(
            serverId,
            {
                type: 'message_server_deleted',
                payload: { messageId, serverId, channelId, hard: true },
            },
            {
                type: 'channel',
                targetId: channelId,
                permission: 'seeDeletedMessages',
                negate: true,
            },
        );

        await this.wsServer.broadcastToServerWithPermission(
            serverId,
            {
                type: 'message_server_deleted',
                payload: { messageId, serverId, channelId, hard: false },
            },
            {
                type: 'channel',
                targetId: channelId,
                permission: 'seeDeletedMessages',
                negate: false,
            },
        );

        await this.wsServer.broadcastToServerWithPermission(
            serverId,
            {
                type: 'message_server_deleted',
                payload: { messageId, serverId, channelId, hard: true },
            },
            {
                type: 'channel',
                targetId: channelId,
                permission: 'viewChannels',
            },
            undefined,
            undefined,
            { onlyBots: true },
        );
        this.logger.debug(
            `[ServerMessageController] deleteMessage: Internal broadcast sent to channel ${channelId}`,
        );

        await this.serverAuditLogService.createAndBroadcast({
            serverId: new mongoose.Types.ObjectId(serverId),
            actorId: new mongoose.Types.ObjectId(userId),
            actionType: 'delete_message',
            targetId: message._id,
            targetType: 'message',
            targetUserId: message.senderId,
            metadata: {
                channelId: message.channelId.toString(),
                channelName: channel.name,
                messageText: message.text,
            },
        });

        return { message: 'Message deleted' };
    }

    @Post(':messageId/pin')
    @ApiOperation({ summary: 'Toggle message pin' })
    @ApiResponse({ status: 200, description: 'Pin status toggled' })
    @ApiResponse({
        status: 403,
        description: 'No permission to pin messages',
    })
    public async togglePin(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('messageId') messageId: string,
        @Req() req: ExpressRequest,
    ): Promise<IServerMessage> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const canPin = await this.permissionService.hasChannelPermission(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
            new mongoose.Types.ObjectId(channelId),
            'pinMessages',
        );
        if (canPin !== true) {
            throw new ForbiddenException('No permission to pin messages');
        }

        const message = await this.serverMessageRepo.findById(
            new mongoose.Types.ObjectId(messageId),
            true,
        );
        if ((message === null) || message.channelId.toString() !== channelId) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        if (message.deletedAt) {
            throw new BadRequestException("Cannot pin a deleted message");
        }

        const updated = await this.serverMessageRepo.update(message._id, {
            isPinned: message.isPinned === false,
        });

        if (updated !== null) {
            const event: IMessageServerPinUpdatedEvent = {
                type: 'message_server_pin_updated',
                payload: {
                    messageId,
                    serverId,
                    channelId,
                    isPinned: updated.isPinned ?? false,
                    isSticky: updated.isSticky ?? false,
                },
            };
            this.wsServer.broadcastToChannel(channelId, event);

            await this.wsServer.broadcastToServerWithPermission(
                serverId,
                event,
                {
                    type: 'channel',
                    targetId: channelId,
                    permission: 'viewChannels',
                },
                undefined,
                undefined,
                { onlyBots: true },
            );


            const channelObj = await this.channelRepo.findById(
                new mongoose.Types.ObjectId(channelId),
            );

            await this.serverAuditLogService.createAndBroadcast({
                serverId: new mongoose.Types.ObjectId(serverId),
                actorId: new mongoose.Types.ObjectId(userId),
                actionType: (updated.isPinned === true) ? 'pin_message' : 'unpin_message',
                targetId: message._id,
                targetType: 'message',
                targetUserId: message.senderId,
                metadata: {
                    channelId: message.channelId.toString(),
                    channelName: channelObj
                        ? channelObj.name
                        : 'Unknown Channel',
                    messageText: message.text,
                },
            });
        }

        if (updated === null) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }
        return updated;
    }

    @Post(':messageId/sticky')
    @ApiOperation({ summary: 'Toggle message sticky' })
    @ApiResponse({ status: 200, description: 'Sticky status toggled' })
    @ApiResponse({
        status: 403,
        description: 'No permission to pin messages',
    })
    public async toggleSticky(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('messageId') messageId: string,
        @Req() req: ExpressRequest,
    ): Promise<IServerMessage> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const canPin = await this.permissionService.hasChannelPermission(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
            new mongoose.Types.ObjectId(channelId),
            'pinMessages',
        );
        if (canPin !== true) {
            throw new ForbiddenException('No permission to pin messages');
        }

        const message = await this.serverMessageRepo.findById(
            new mongoose.Types.ObjectId(messageId),
            true, // Include soft-deleted messages
        );
        if ((message === null) || message.channelId.toString() !== channelId) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        if (message.deletedAt) {
            throw new BadRequestException('Cannot sticky a deleted message');
        }

        const updated = await this.serverMessageRepo.update(message._id, {
            isSticky: message.isSticky === false,
        });

        if (updated !== null) {
            const event: IMessageServerPinUpdatedEvent = {
                type: 'message_server_pin_updated',
                payload: {
                    messageId,
                    serverId,
                    channelId,
                    isPinned: updated.isPinned ?? false,
                    isSticky: updated.isSticky ?? false,
                },
            };
            this.wsServer.broadcastToChannel(channelId, event);

            await this.wsServer.broadcastToServerWithPermission(
                serverId,
                event,
                {
                    type: 'channel',
                    targetId: channelId,
                    permission: 'viewChannels',
                },
                undefined,
                undefined,
                { onlyBots: true },
            );


            const channelObj = await this.channelRepo.findById(
                new mongoose.Types.ObjectId(channelId),
            );

            await this.serverAuditLogService.createAndBroadcast({
                serverId: new mongoose.Types.ObjectId(serverId),
                actorId: new mongoose.Types.ObjectId(userId),
                actionType: (updated.isSticky === true)
                    ? 'sticky_message'
                    : 'unsticky_message',
                targetId: message._id,
                targetType: 'message',
                targetUserId: message.senderId,
                metadata: {
                    channelId: message.channelId.toString(),
                    channelName: channelObj
                        ? channelObj.name
                        : 'Unknown Channel',
                },
            });
        }

        if (updated === null) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }
        return updated;
    }
}
