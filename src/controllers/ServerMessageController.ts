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
    Inject,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiOkResponse,
    ApiBearerAuth,
    ApiQuery,
} from '@nestjs/swagger';
import {
    ServerMessageResponseDTO,
    GetMessageResponseDTO,
    MessageDeletedResponseDTO,
    PollVoteResponseDTO,
    BulkDeleteResponseDTO,
    TogglePinResponseDTO,
    ToggleStickyResponseDTO,
} from './dto/server-message.response.dto';
import { TYPES } from '@/di/types';
import crypto from 'crypto';
import type { IRedisService } from '@/di/interfaces/IRedisService';
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
import { EmbedService } from '@/services/EmbedService';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import type { IMessageSearchService } from '@/di/interfaces/IMessageSearchService';
import type {
    IMessageServerEvent,
    IChannelUnreadUpdatedEvent,
    IMessageServerEditedEvent,
    IMessageServerPinUpdatedEvent,
} from '@/ws/protocol/events/messages';
import { messagesSentCounter, websocketMessagesCounter } from '@/utils/metrics';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { generateSnowflakeId } from '@/utils/snowflake';
import { ErrorMessages } from '@/constants/errorMessages';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import {
    SendMessageRequestDTO,
    ServerEditMessageRequestDTO,
    BulkDeleteMessagesRequestDTO,
} from './dto/server-message.request.dto';
import { PollVoteRequestDTO } from './dto/poll-vote.request.dto';

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
        @Inject(TYPES.EmbedService)
        private embedService: EmbedService,
        @Inject(TYPES.RedisService)
        private redisService: IRedisService,
        @Inject(TYPES.MessageSearchService)
        private searchService: IMessageSearchService,
    ) {}

    private allowlistProxyUrls(msgs: IServerMessage[]): void {
        const pipeline = this.redisService.getClient().pipeline();
        let added = false;

        const addUrl = (url: string | undefined): boolean => {
            if (url !== undefined && url !== '' && url.startsWith('https://')) {
                const hash = crypto
                    .createHash('sha256')
                    .update(url)
                    .digest('hex');
                pipeline.set(
                    `proxy:allow:${hash}`,
                    url,
                    'EX',
                    60 * 60 * 24 * 7,
                );
                return true;
            }
            return false;
        };

        for (const msg of msgs) {
            if (msg.isWebhook === true && msg.webhookAvatarUrl !== undefined) {
                if (addUrl(msg.webhookAvatarUrl)) added = true;
            }
            if (msg.embeds !== undefined) {
                for (const embed of msg.embeds) {
                    if (addUrl(embed.image?.url)) added = true;
                    if (addUrl(embed.thumbnail?.url)) added = true;
                    if (addUrl(embed.author?.icon_url)) added = true;
                    if (addUrl(embed.footer?.icon_url)) added = true;
                }
            }
        }
        if (added) {
            pipeline.exec().catch((err: unknown) => {
                this.logger.error(
                    'Failed to allowlist webhook avatars during fetch',
                    (err as Error).stack,
                );
            });
        }
    }

    @Get()
    @ApiOperation({ summary: 'Get channel messages' })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'before', required: false, type: String })
    @ApiQuery({ name: 'around', required: false, type: String })
    @ApiOkResponse({
        type: [ServerMessageResponseDTO],
        description: 'Messages retrieved',
    })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    public async getMessages(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @CurrentUser('id') userId: string,
        @Query('limit') limit: number = 50,
        @Query('before') before?: string,
        @Query('around') around?: string,
        @Query('after') after?: string,
    ): Promise<IServerMessage[]> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const channel = await this.channelRepo.findById(channelId);
        if (channel === null || channel.serverId.toString() !== serverId) {
            throw new NotFoundException(ErrorMessages.CHANNEL.NOT_FOUND);
        }
        if (channel.type === 'link') {
            throw new ForbiddenException(
                'Cannot read messages from a link channel',
            );
        }

        await this.permissionService.requireChannelPermission(
            serverId,
            userId,
            channelId,
            'viewChannels',
            new ForbiddenException(ErrorMessages.CHANNEL.NOT_FOUND),
        );

        const includeDeleted =
            await this.permissionService.hasChannelPermission(
                serverId,
                userId,
                channelId,
                'seeDeletedMessages',
            );

        const msgs = await this.serverMessageRepo.findByChannelId(
            channelId,
            limit,
            before,
            around,
            after,
            includeDeleted,
        );

        const messageIds = msgs.map((m) => m.snowflakeId);
        const reactionsMap = await this.reactionRepo.getReactionsForMessages(
            messageIds,
            'server',
            userId,
        );

        this.allowlistProxyUrls(msgs);

        return msgs.map((msg) => {
            const msgUnknown: unknown = msg;
            const msgObj = msgUnknown as Record<string, unknown>;
            return {
                ...msgObj,
                reactions:
                    (reactionsMap as Record<string, unknown[]>)[
                        msg.snowflakeId
                    ] || [],
            } as IServerMessage;
        });
    }

    @Post()
    @ApiOperation({ summary: 'Send a message' })
    @ApiResponse({
        status: 201,
        type: ServerMessageResponseDTO,
        description: 'Message sent',
    })
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
        @CurrentUser('id') userId: string,
        @CurrentUser('isBot') isUserBot: boolean | undefined,
        @CurrentUser('username') senderUsername: string,
        @Body() body: SendMessageRequestDTO,
    ): Promise<IServerMessage> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const server = await this.serverRepo.findById(serverId);
        const isOwner = server !== null && server.ownerId.toString() === userId;

        if (
            isOwner === false &&
            member.communicationDisabledUntil !== undefined &&
            new Date(member.communicationDisabledUntil) > new Date()
        ) {
            throw new ForbiddenException(
                `You are timed out until ${new Date(member.communicationDisabledUntil).toISOString()}. You cannot send messages.`,
            );
        }

        await this.permissionService.requireChannelPermission(
            serverId,
            userId,
            channelId,
            'sendMessages',
            new ForbiddenException(ErrorMessages.CHANNEL.NO_PERMISSION_SEND),
        );

        const channel = await this.channelRepo.findById(channelId);
        if (channel === null || channel.serverId.toString() !== serverId) {
            throw new NotFoundException(ErrorMessages.CHANNEL.NOT_FOUND);
        }
        if (channel.type === 'link') {
            throw new ForbiddenException(
                'Cannot send messages to a link channel via API',
            );
        }

        // Check for slow mode
        if (channel.slowMode !== undefined && channel.slowMode > 0) {
            const hasBypass = await this.permissionService.hasChannelPermission(
                serverId,
                userId,
                channelId,
                'bypassSlowmode',
            );

            if (hasBypass !== true) {
                const lastMessage =
                    await this.serverMessageRepo.findLastByChannelAndUser(
                        channelId,
                        userId,
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
        const components = body.components;
        const attachments = body.attachments ?? [];
        const isBot = isUserBot === true;

        if (embeds !== undefined && embeds.length > 0) {
            if (isBot === false) {
                throw new ForbiddenException(
                    'Only bots can send messages with rich embeds',
                );
            }
        }
        if (
            components !== undefined &&
            components.length > 0 &&
            isBot === false
        ) {
            throw new ForbiddenException(
                'Only bots can send messages with components',
            );
        }

        if (
            messageText === '' &&
            (embeds === undefined || embeds.length === 0) &&
            (components === undefined || components.length === 0) &&
            attachments.length === 0
        ) {
            throw new BadRequestException(ErrorMessages.MESSAGE.TEXT_REQUIRED);
        }

        const message = await this.serverMessageRepo.create({
            serverId: serverId,
            channelId: channelId,
            senderId: userId,
            text: messageText,
            repliedToMessageId:
                body.replyToId !== undefined && body.replyToId !== ''
                    ? body.replyToId
                    : undefined,
            embeds,
            components,
            attachments,
            interaction: body.interaction,
            stickerId:
                body.stickerId !== undefined && body.stickerId !== ''
                    ? body.stickerId
                    : undefined,
            poll: body.poll
                ? {
                      ...body.poll,
                      expiresAt:
                          body.poll.expiresAt !== undefined &&
                          body.poll.expiresAt !== ''
                              ? new Date(body.poll.expiresAt)
                              : undefined,
                      options: body.poll.options.map((opt) => ({
                          ...opt,
                          id: generateSnowflakeId(),
                          votes: [],
                      })),
                  }
                : undefined,
            noEmbeds: body.noEmbeds,
        });

        await this.channelRepo.updateLastMessageAt(channelId);

        this.searchService
            .indexChannelMessage(message, isBot)
            .catch((err: unknown) => {
                this.logger.error(
                    'Failed to index channel message',
                    (err as Error).stack,
                );
            });

        // Track message metrics
        messagesSentCounter.labels('server').inc();
        websocketMessagesCounter.labels('server_message', 'outbound').inc();

        const messagePayload: IMessageServerEvent = {
            type: 'message_server',
            payload: {
                messageId: message.snowflakeId,
                id: message.snowflakeId,
                serverId: serverId,
                channelId: channelId,
                senderId: userId,
                senderIsBot: isUserBot ?? false,
                senderUsername,
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
                components: message.components || [],
                attachments: message.attachments || [],
                reactions: [],
                interaction:
                    message.interaction?.command !== undefined &&
                    message.interaction.command !== ''
                        ? message.interaction
                        : null,
                stickerId: message.stickerId?.toString() ?? null,
                poll: message.poll ?? null,
                noEmbeds: message.noEmbeds,
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
        this.wsServer.broadcastToServer(
            serverId,
            unreadPayload,
            undefined,
            undefined,
            {
                excludeBots: true,
            },
        );

        if (message.text && message.text.includes('http')) {
            Promise.resolve()
                .then(() => this.embedService.processServerMessage(message))
                .catch((err) =>
                    this.logger.error(
                        'Failed to process embeds for new message',
                        err.stack,
                    ),
                );
        }

        return message;
    }

    @Get('pins')
    @ApiOperation({ summary: 'Get all pinned messages' })
    @ApiOkResponse({
        type: [ServerMessageResponseDTO],
        description: 'Pinned messages retrieved',
    })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    public async getPinnedMessages(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @CurrentUser('id') userId: string,
    ): Promise<IServerMessage[]> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        await this.permissionService.requireChannelPermission(
            serverId,
            userId,
            channelId,
            'viewChannels',
            new ForbiddenException(ErrorMessages.CHANNEL.NOT_FOUND),
        );

        const includeDeleted =
            await this.permissionService.hasChannelPermission(
                serverId,
                userId,
                channelId,
                'seeDeletedMessages',
            );

        const pins = await this.serverMessageRepo.findPinnedByChannelId(
            channelId,
            includeDeleted,
        );

        const pinIds = pins.map((p) => p.snowflakeId);
        if (pinIds.length === 0) return [];

        const reactionsMap = await this.reactionRepo.getReactionsForMessages(
            pinIds,
            'server',
            userId,
        );

        this.allowlistProxyUrls(pins);

        return pins.map((pin) => ({
            ...pin,
            reactions:
                (reactionsMap as Record<string, unknown[]>)[pin.snowflakeId] ||
                [],
        })) as IServerMessage[];
    }

    @Get(':messageId')
    @ApiOperation({ summary: 'Get a message' })
    @ApiOkResponse({
        type: GetMessageResponseDTO,
        description: 'Message retrieved',
    })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    @ApiResponse({ status: 404, description: ErrorMessages.MESSAGE.NOT_FOUND })
    public async getMessage(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('messageId') messageId: string,
        @CurrentUser('id') userId: string,
    ): Promise<{
        message: IServerMessage;
        repliedMessage: IServerMessage | null;
    }> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const channel = await this.channelRepo.findById(channelId);
        if (channel === null || channel.serverId.toString() !== serverId) {
            throw new NotFoundException(ErrorMessages.CHANNEL.NOT_FOUND);
        }
        if (channel.type === 'link') {
            throw new ForbiddenException(
                'Cannot read a message from a link channel',
            );
        }

        await this.permissionService.requireChannelPermission(
            serverId,
            userId,
            channelId,
            'viewChannels',
            new ForbiddenException(ErrorMessages.CHANNEL.NOT_FOUND),
        );

        const includeDeleted =
            await this.permissionService.hasChannelPermission(
                serverId,
                userId,
                channelId,
                'seeDeletedMessages',
            );

        const message = await this.serverMessageRepo.findById(
            messageId,
            includeDeleted,
        );
        if (message === null || message.channelId.toString() !== channelId) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        let repliedMessage: IServerMessage | null = null;
        // Handle both legacy and new reply ID fields for backward compatibility
        if (message.replyToId !== undefined && message.replyToId !== '') {
            const repliedMsg = await this.serverMessageRepo.findById(
                message.replyToId,
                includeDeleted,
            );
            if (
                repliedMsg !== null &&
                repliedMsg.channelId.toString() === channelId
            ) {
                repliedMessage = repliedMsg;
            }
        } else if (
            message.repliedToMessageId !== undefined &&
            message.repliedToMessageId !== ''
        ) {
            const repliedMsg = await this.serverMessageRepo.findById(
                message.repliedToMessageId,
                includeDeleted,
            );
            if (
                repliedMsg !== null &&
                repliedMsg.channelId.toString() === channelId
            ) {
                repliedMessage = repliedMsg;
            }
        }

        const reactions = await this.reactionRepo.getReactionsByMessage(
            messageId,
            'server',
            userId,
        );

        const msgObj = {
            ...('toObject' in message && typeof message.toObject === 'function'
                ? message.toObject()
                : message),
        } as IServerMessage;

        const messagesToAllowlist = [msgObj];
        if (repliedMessage !== null) {
            messagesToAllowlist.push({
                ...('toObject' in repliedMessage &&
                typeof repliedMessage.toObject === 'function'
                    ? repliedMessage.toObject()
                    : repliedMessage),
            } as IServerMessage);
        }
        this.allowlistProxyUrls(messagesToAllowlist);

        return {
            message: {
                ...msgObj,
                reactions,
            },
            repliedMessage,
        };
    }

    @Patch(':messageId')
    @ApiOperation({ summary: 'Edit a message' })
    @ApiOkResponse({
        type: ServerMessageResponseDTO,
        description: 'Message updated',
    })
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
        @CurrentUser('id') userId: string,
        @CurrentUser('isBot') isUserBot: boolean | undefined,
        @Body() body: ServerEditMessageRequestDTO,
    ): Promise<IServerMessage> {
        const message = await this.serverMessageRepo.findById(messageId, true);
        if (message === null || message.channelId.toString() !== channelId) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        if (message.deletedAt) {
            throw new BadRequestException('Cannot edit a deleted message');
        }

        if (message.senderId.toString() !== userId) {
            throw new ForbiddenException(
                ErrorMessages.MESSAGE.ONLY_SENDER_EDIT,
            );
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );

        const serverObj = await this.serverRepo.findById(serverId);
        const isOwner =
            serverObj !== null && serverObj.ownerId.toString() === userId;

        if (
            isOwner === false &&
            member !== null &&
            member.communicationDisabledUntil !== undefined &&
            new Date(member.communicationDisabledUntil) > new Date()
        ) {
            throw new ForbiddenException(
                'You cannot edit messages while timed out.',
            );
        }

        const messageText = (body.content ?? body.text ?? message.text).trim();
        const embeds = body.embeds;
        const components = body.components;
        const isBot = isUserBot === true;
        if (embeds !== undefined && embeds.length > 0 && isBot === false) {
            throw new ForbiddenException(
                'Only bots can edit messages with rich embeds',
            );
        }
        if (
            components !== undefined &&
            components.length > 0 &&
            isBot === false
        ) {
            throw new ForbiddenException(
                'Only bots can edit messages with components',
            );
        }

        if (
            messageText === '' &&
            (embeds === undefined || embeds.length === 0) &&
            (components === undefined || components.length === 0)
        ) {
            throw new BadRequestException(ErrorMessages.MESSAGE.TEXT_REQUIRED);
        }

        const updatedMessage = await this.serverMessageRepo.update(messageId, {
            text: messageText,
            ...(embeds !== undefined ? { embeds } : {}),
            ...(components !== undefined ? { components } : {}),
            isEdited: true,
            editedAt: new Date(),
        });
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
                embeds: updatedMessage.embeds || [],
                components: updatedMessage.components || [],
                attachments: updatedMessage.attachments || [],
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

        const channelObj = await this.channelRepo.findById(channelId);

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: userId,
            actionType: 'edit_message',
            targetId: message.snowflakeId,
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

        if (updatedMessage.text && updatedMessage.text.includes('http')) {
            Promise.resolve()
                .then(() =>
                    this.embedService.processServerMessage(updatedMessage),
                )
                .catch((err) =>
                    this.logger.error('Failed to process embeds', err.stack),
                );
        }

        return updatedMessage;
    }

    @Post(':messageId/poll/vote')
    @ApiOperation({ summary: 'Vote on a poll' })
    @ApiOkResponse({
        type: PollVoteResponseDTO,
        description: 'Vote registered',
    })
    @ApiResponse({ status: 400, description: 'Invalid vote or not a poll' })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    @ApiResponse({ status: 404, description: ErrorMessages.MESSAGE.NOT_FOUND })
    public async votePoll(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('messageId') messageId: string,
        @Body() body: PollVoteRequestDTO,
        @CurrentUser('id') userId: string,
    ): Promise<IServerMessage> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        await this.permissionService.requireChannelPermission(
            serverId,
            userId,
            channelId,
            'viewChannels',
            new ForbiddenException(ErrorMessages.CHANNEL.NOT_FOUND),
        );

        const message = await this.serverMessageRepo.findById(messageId, false);
        if (message === null || message.channelId.toString() !== channelId) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        if (!message.poll) {
            throw new BadRequestException(
                'This message does not contain a poll.',
            );
        }

        const { poll } = message;
        if (poll.expiresAt && new Date() > new Date(poll.expiresAt)) {
            throw new BadRequestException(
                'This poll has ended and can no longer be voted on.',
            );
        }

        if (!poll.multiSelect && body.optionIds.length > 1) {
            throw new BadRequestException(
                'This poll does not allow multiple selections.',
            );
        }

        const validOptionIds = poll.options.map((o) => o.id);
        const allValid = body.optionIds.every((id) =>
            validOptionIds.includes(id),
        );
        if (!allValid) {
            throw new BadRequestException(
                'One or more option IDs are invalid.',
            );
        }

        const updatedMessage = await this.serverMessageRepo.setPollVote(
            messageId,
            userId,
            body.optionIds,
        );

        if (!updatedMessage) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        this.wsServer.broadcastToChannel(channelId, {
            type: 'poll_vote_updated_server',
            payload: {
                messageId,
                serverId,
                channelId,
                poll: updatedMessage.poll ?? poll,
            },
        });

        return updatedMessage;
    }

    @Delete('bulk-delete')
    @ApiOperation({ summary: 'Bulk delete messages' })
    @ApiOkResponse({
        type: BulkDeleteResponseDTO,
        description: 'Messages deleted',
    })
    public async bulkDeleteMessages(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Body() body: BulkDeleteMessagesRequestDTO,
        @CurrentUser('id') userId: string,
    ): Promise<{ message: string; deletedCount: number }> {
        const canManage = await this.permissionService.hasChannelPermission(
            serverId,
            userId,
            channelId,
            'manageMessages',
        );
        const canDeleteOthers =
            await this.permissionService.hasChannelPermission(
                serverId,
                userId,
                channelId,
                'deleteMessagesOfOthers',
            );

        if (canManage !== true && canDeleteOthers !== true) {
            throw new ForbiddenException(
                ErrorMessages.MESSAGE.NO_PERMISSION_DELETE,
            );
        }

        const deletedCount = await this.serverMessageRepo.bulkDelete(
            channelId,
            body.messageIds,
        );

        await this.wsServer.broadcastToServerWithPermission(
            serverId,
            {
                type: 'messages_server_bulk_deleted',
                payload: {
                    messageIds: body.messageIds,
                    serverId,
                    channelId,
                    hard: true,
                },
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
                payload: {
                    messageIds: body.messageIds,
                    serverId,
                    channelId,
                    hard: false,
                },
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
                payload: {
                    messageIds: body.messageIds,
                    serverId,
                    channelId,
                    hard: true,
                },
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
    @ApiOkResponse({
        type: MessageDeletedResponseDTO,
        description: 'Message deleted',
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MESSAGE.NO_PERMISSION_DELETE,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.MESSAGE.NOT_FOUND })
    public async deleteMessage(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('messageId') messageId: string,
        @CurrentUser('id') userId: string,
    ): Promise<{ message: string }> {
        const message = await this.serverMessageRepo.findById(messageId, true);
        if (message === null || message.channelId.toString() !== channelId) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        if (message.deletedAt) {
            return { message: 'Message deleted' };
        }

        const channel = await this.channelRepo.findById(channelId);
        if (channel === null) {
            throw new NotFoundException(ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const canManage = await this.permissionService.hasChannelPermission(
            serverId,
            userId,
            channelId,
            'manageMessages',
        );
        const canDeleteOthers =
            await this.permissionService.hasChannelPermission(
                serverId,
                userId,
                channelId,
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
            serverId,
            userId,
        );
        const serverObj = await this.serverRepo.findById(serverId);
        const isOwner =
            serverObj !== null && serverObj.ownerId.toString() === userId;

        if (
            isOwner === false &&
            member !== null &&
            member.communicationDisabledUntil !== undefined &&
            new Date(member.communicationDisabledUntil) > new Date()
        ) {
            throw new ForbiddenException(
                'You cannot delete messages while timed out.',
            );
        }

        await this.serverMessageRepo.delete(messageId);

        this.searchService
            .removeChannelMessage(messageId)
            .catch((err: unknown) => {
                this.logger.error(
                    'Failed to remove channel message from index',
                    (err as Error).stack,
                );
            });

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
            serverId: serverId,
            actorId: userId,
            actionType: 'delete_message',
            targetId: message.snowflakeId,
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
    @ApiOkResponse({
        type: TogglePinResponseDTO,
        description: 'Pin status toggled',
    })
    @ApiResponse({
        status: 403,
        description: 'No permission to pin messages',
    })
    public async togglePin(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('messageId') messageId: string,
        @CurrentUser('id') userId: string,
    ): Promise<IServerMessage> {
        await this.permissionService.requireChannelPermission(
            serverId,
            userId,
            channelId,
            'pinMessages',
            new ForbiddenException('No permission to pin messages'),
        );

        const message = await this.serverMessageRepo.findById(messageId, true);
        if (message === null || message.channelId.toString() !== channelId) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        if (message.deletedAt) {
            throw new BadRequestException('Cannot pin a deleted message');
        }

        const updated = await this.serverMessageRepo.update(
            message.snowflakeId,
            {
                isPinned: message.isPinned === false,
            },
        );

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

            const channelObj = await this.channelRepo.findById(channelId);

            await this.serverAuditLogService.createAndBroadcast({
                serverId: serverId,
                actorId: userId,
                actionType:
                    updated.isPinned === true ? 'pin_message' : 'unpin_message',
                targetId: message.snowflakeId,
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

        this.searchService
            .updateChannelMessageFlags(messageId, {
                isPinned: updated.isPinned ?? false,
            })
            .catch((err: unknown) => {
                this.logger.error(
                    '[ServerMessageController] Failed to re-index pinned message',
                    err,
                );
            });

        return updated;
    }

    @Post(':messageId/sticky')
    @ApiOperation({ summary: 'Toggle message sticky' })
    @ApiOkResponse({
        type: ToggleStickyResponseDTO,
        description: 'Sticky status toggled',
    })
    @ApiResponse({
        status: 403,
        description: 'No permission to pin messages',
    })
    public async toggleSticky(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('messageId') messageId: string,
        @CurrentUser('id') userId: string,
    ): Promise<IServerMessage> {
        await this.permissionService.requireChannelPermission(
            serverId,
            userId,
            channelId,
            'pinMessages',
            new ForbiddenException('No permission to pin messages'),
        );

        const message = await this.serverMessageRepo.findById(
            messageId,
            true, // Include soft-deleted messages
        );
        if (message === null || message.channelId.toString() !== channelId) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        if (message.deletedAt) {
            throw new BadRequestException('Cannot sticky a deleted message');
        }

        const updated = await this.serverMessageRepo.update(
            message.snowflakeId,
            {
                isSticky: message.isSticky === false,
            },
        );

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

            const channelObj = await this.channelRepo.findById(channelId);

            await this.serverAuditLogService.createAndBroadcast({
                serverId: serverId,
                actorId: userId,
                actionType:
                    updated.isSticky === true
                        ? 'sticky_message'
                        : 'unsticky_message',
                targetId: message.snowflakeId,
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

        this.searchService
            .updateChannelMessageFlags(messageId, {
                isSticky: updated.isSticky ?? false,
            })
            .catch((err: unknown) => {
                this.logger.error(
                    '[ServerMessageController] Failed to re-index stickied message',
                    err,
                );
            });

        return updated;
    }
}
