import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    UseGuards,
    Inject,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiOkResponse,
    ApiBearerAuth,
    ApiBody,
    ApiExtraModels,
    getSchemaPath,
} from '@nestjs/swagger';
import { ReactionsListResponseDTO } from './dto/reaction.response.dto';
import { TYPES } from '@/di/types';
import type {
    IReactionRepository,
    ReactionData,
} from '@/di/interfaces/IReactionRepository';
import type { IMessageRepository } from '@/di/interfaces/IMessageRepository';
import type { IServerMessageRepository } from '@/di/interfaces/IServerMessageRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import type { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import type { IBlockRepository } from '@/di/interfaces/IBlockRepository';
import type { IMuteRepository } from '@/di/interfaces/IMuteRepository';
import { BlockFlags } from '@/privacy/blockFlags';
import { PermissionService } from '@/permissions/PermissionService';
import { assertHttpNotMuted } from '@/utils/mute';
import type { IWarningRepository } from '@/di/interfaces/IWarningRepository';
import { assertHttpNotWarned } from '@/utils/warning';

import type { IWsServer } from '@/ws/interfaces/IWsServer';
import { ErrorMessages } from '@/constants/errorMessages';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { ApiError } from '@/utils/ApiError';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import {
    AddUnicodeReactionRequestDTO,
    AddCustomReactionRequestDTO,
    RemoveUnicodeReactionRequestDTO,
    RemoveCustomReactionRequestDTO,
} from './dto/reaction.request.dto';
import type {
    IReactionAddedEvent,
    IReactionRemovedEvent,
} from '@/ws/protocol/events/reactions';

const REACTION_VALIDATION_ERRORS: string[] = [
    ErrorMessages.REACTION.EMOJI_ID_REQUIRED,
    ErrorMessages.REACTION.CUSTOM_NOT_FOUND,
    ErrorMessages.REACTION.ALREADY_REACTED,
    ErrorMessages.REACTION.MAX_REACTIONS,
    ErrorMessages.REACTION.INVALID_EMOJI,
];

@Controller('api/v1')
@ApiTags('Reactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiExtraModels(
    AddUnicodeReactionRequestDTO,
    AddCustomReactionRequestDTO,
    RemoveUnicodeReactionRequestDTO,
    RemoveCustomReactionRequestDTO,
)
export class ReactionController {
    public constructor(
        @Inject(TYPES.ReactionRepository)
        private reactionRepo: IReactionRepository,
        @Inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @Inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @Inject(TYPES.WsServer)
        private wsServer: IWsServer,
        @Inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
        @Inject(TYPES.AuditLogRepository)
        private auditLogRepo: IAuditLogRepository,
        @Inject(TYPES.ServerAuditLogService)
        private serverAuditLogService: IServerAuditLogService,
        @Inject(TYPES.BlockRepository)
        private blockRepo: IBlockRepository,
        @Inject(TYPES.MuteRepository)
        private muteRepo: IMuteRepository,
        @Inject(TYPES.WarningRepository)
        private warningRepo: IWarningRepository,
    ) {}

    @Get('messages/:messageId/reactions')
    @ApiOperation({ summary: 'Get DM reactions' })
    @ApiOkResponse({
        type: ReactionsListResponseDTO,
        description: 'Reactions retrieved successfully',
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Message not found' })
    public async getDmReactions(
        @Param('messageId') messageId: string,
        @CurrentUser('id') userId: string,
    ): Promise<{ reactions: ReactionData[] }> {
        const message = await this.messageRepo.findById(messageId);
        if (message === null) {
            throw new ApiError(404, ErrorMessages.MESSAGE.NOT_FOUND);
        }

        if (
            message.senderId.toString() !== userId &&
            message.receiverId.toString() !== userId
        ) {
            throw new ApiError(403, ErrorMessages.REACTION.ACCESS_DENIED);
        }

        const reactions = await this.reactionRepo.getReactionsByMessage(
            messageId,
            'dm',
            userId,
        );
        return { reactions };
    }

    @Post('messages/:messageId/reactions')
    @ApiOperation({ summary: 'Add reaction to DM' })
    @ApiBody({
        schema: {
            oneOf: [
                { $ref: getSchemaPath(AddUnicodeReactionRequestDTO) },
                { $ref: getSchemaPath(AddCustomReactionRequestDTO) },
            ],
        },
    })
    @ApiResponse({
        status: 201,
        type: ReactionsListResponseDTO,
        description: 'Reaction added',
    })
    @ApiResponse({ status: 400, description: 'Invalid emoji or limit reached' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Message not found' })
    public async addDmReaction(
        @Param('messageId') messageId: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('username') username: string,
        @Body()
        body: AddUnicodeReactionRequestDTO | AddCustomReactionRequestDTO,
    ): Promise<{ reactions: ReactionData[] }> {
        await assertHttpNotMuted(this.muteRepo, userId, 'add reactions');
        await assertHttpNotWarned(this.warningRepo, userId, 'add reactions');
        const { emoji, emojiType } = body;
        const emojiId = emojiType === 'custom' ? body.emojiId : undefined;

        const message = await this.messageRepo.findById(messageId);
        if (message === null) {
            throw new ApiError(404, ErrorMessages.MESSAGE.NOT_FOUND);
        }

        const receiverId =
            message.senderId.toString() === userId
                ? message.receiverId.toString()
                : message.senderId.toString();

        const blockFlags = await this.blockRepo.getActiveBlockFlags(
            receiverId,
            userId,
        );

        if ((blockFlags & BlockFlags.BLOCK_REACTIONS) !== 0) {
            const reactions = await this.reactionRepo.getReactionsByMessage(
                messageId,
                'dm',
                userId,
            );
            return { reactions };
        }

        try {
            await this.reactionRepo.addReaction(
                messageId,
                'dm',
                userId,
                emoji,
                emojiType,
                emojiId,
            );
        } catch (err: unknown) {
            const error = err as Error;
            if (REACTION_VALIDATION_ERRORS.includes(error.message)) {
                throw new ApiError(400, error.message);
            }
            throw err;
        }

        const areFriends = await this.friendshipRepo.areFriends(
            message.senderId.toString(),
            message.receiverId.toString(),
        );

        if (areFriends !== true) {
            await this.reactionRepo.removeReaction(
                messageId,
                'dm',
                userId,
                emoji,
                emojiId,
            );
            throw new ApiError(403, ErrorMessages.REACTION.ACCESS_DENIED);
        }

        const reactions = await this.reactionRepo.getReactionsByMessage(
            messageId,
            'dm',
            userId,
        );

        // Broadcast reaction to both users
        const event: IReactionAddedEvent = {
            type: 'reaction_added',
            payload: {
                messageId,
                userId,
                username: username || '',
                emoji,
                emojiType,
                emojiId,
                messageType: 'dm',
            },
        };

        for (const uid of [userId, receiverId]) {
            this.wsServer.broadcastToUser(uid, event);
        }

        return { reactions };
    }

    @Delete('messages/:messageId/reactions')
    @ApiOperation({ summary: 'Remove reaction from DM' })
    @ApiBody({
        schema: {
            oneOf: [
                {
                    $ref: getSchemaPath(RemoveUnicodeReactionRequestDTO),
                },
                { $ref: getSchemaPath(RemoveCustomReactionRequestDTO) },
            ],
        },
    })
    @ApiOkResponse({
        type: ReactionsListResponseDTO,
        description: 'Reaction removed',
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Message not found' })
    public async removeDmReaction(
        @Param('messageId') messageId: string,
        @CurrentUser('id') userId: string,
        @Body()
        body: RemoveUnicodeReactionRequestDTO | RemoveCustomReactionRequestDTO,
    ): Promise<{ reactions: ReactionData[] }> {
        await assertHttpNotMuted(this.muteRepo, userId, 'remove reactions');
        await assertHttpNotWarned(this.warningRepo, userId, 'remove reactions');
        const emoji = body.emoji;
        const emojiId = 'emojiId' in body ? body.emojiId : undefined;

        const message = await this.messageRepo.findById(messageId);
        if (message === null) {
            throw new ApiError(404, ErrorMessages.MESSAGE.NOT_FOUND);
        }

        if (
            message.senderId.toString() !== userId &&
            message.receiverId.toString() !== userId
        ) {
            throw new ApiError(403, ErrorMessages.REACTION.ACCESS_DENIED);
        }

        const removed = await this.reactionRepo.removeReaction(
            messageId,
            'dm',
            userId,
            emoji,
            emojiId,
        );
        if (removed !== true) {
            throw new ApiError(404, ErrorMessages.REACTION.REACTION_NOT_FOUND);
        }

        const reactions = await this.reactionRepo.getReactionsByMessage(
            messageId,
            'dm',
            userId,
        );

        const receiverId =
            message.senderId.toString() === userId
                ? message.receiverId.toString()
                : message.senderId.toString();

        // Broadcast reaction removal to both users
        const event: IReactionRemovedEvent = {
            type: 'reaction_removed',
            payload: {
                messageId,
                userId,
                emoji: emoji ?? '',
                emojiType:
                    emojiId !== undefined && emojiId !== ''
                        ? 'custom'
                        : 'unicode',
                emojiId: emojiId ?? undefined,
                messageType: 'dm',
            },
        };

        for (const uid of [userId, receiverId]) {
            this.wsServer.broadcastToUser(uid, event);
        }

        return { reactions };
    }

    @Post('servers/:serverId/channels/:channelId/messages/:messageId/reactions')
    @ApiOperation({ summary: 'Add reaction to server message' })
    @ApiBody({
        schema: {
            oneOf: [
                { $ref: getSchemaPath(AddUnicodeReactionRequestDTO) },
                { $ref: getSchemaPath(AddCustomReactionRequestDTO) },
            ],
        },
    })
    @ApiResponse({
        status: 201,
        type: ReactionsListResponseDTO,
        description: 'Reaction added',
    })
    @ApiResponse({ status: 400, description: 'Invalid emoji or limit reached' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Message or channel not found' })
    public async addServerReaction(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('messageId') messageId: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('username') username: string,
        @Body()
        body: AddUnicodeReactionRequestDTO | AddCustomReactionRequestDTO,
    ): Promise<{ reactions: ReactionData[] }> {
        await assertHttpNotMuted(this.muteRepo, userId, 'add reactions');
        await assertHttpNotWarned(this.warningRepo, userId, 'add reactions');
        const { emoji, emojiType } = body;
        const emojiId = emojiType === 'custom' ? body.emojiId : undefined;

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_SERVER_MEMBER);
        }

        const channel = await this.channelRepo.findById(channelId);
        if (channel === null || channel.serverId.toString() !== serverId) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        await this.permissionService.requireChannelPermission(
            serverId,
            userId,
            channelId,
            'addReactions',
            new ApiError(403, ErrorMessages.REACTION.MISSING_PERMISSION_ADD),
        );

        const message = await this.serverMessageRepo.findById(messageId);
        if (message === null || message.channelId.toString() !== channelId) {
            throw new ApiError(404, ErrorMessages.MESSAGE.NOT_FOUND);
        }

        const blockFlags = await this.blockRepo.getActiveBlockFlags(
            message.senderId,
            userId,
        );

        if ((blockFlags & BlockFlags.BLOCK_REACTIONS) !== 0) {
            const reactions = await this.reactionRepo.getReactionsByMessage(
                messageId,
                'server',
                userId,
            );
            return { reactions };
        }

        try {
            await this.reactionRepo.addReaction(
                messageId,
                'server',
                userId,
                emoji,
                emojiType,
                emojiId,
            );
        } catch (err: unknown) {
            const error = err as Error;
            if (REACTION_VALIDATION_ERRORS.includes(error.message)) {
                throw new ApiError(400, error.message);
            }
            throw err;
        }

        const reactions = await this.reactionRepo.getReactionsByMessage(
            messageId,
            'server',
            userId,
        );

        const event: IReactionAddedEvent = {
            type: 'reaction_added',
            payload: {
                messageId,
                userId,
                username,
                emoji,
                emojiType,
                emojiId,
                messageType: 'server',
                serverId,
                channelId,
            },
        };

        this.wsServer.broadcastToServer(serverId, event);

        return { reactions };
    }

    @Delete(
        'servers/:serverId/channels/:channelId/messages/:messageId/reactions',
    )
    @ApiOperation({ summary: 'Remove reaction from server message' })
    @ApiBody({
        schema: {
            oneOf: [
                {
                    $ref: getSchemaPath(RemoveUnicodeReactionRequestDTO),
                },
                { $ref: getSchemaPath(RemoveCustomReactionRequestDTO) },
            ],
        },
    })
    @ApiOkResponse({
        type: ReactionsListResponseDTO,
        description: 'Reaction removed',
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Message or channel not found' })
    public async removeServerReaction(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('messageId') messageId: string,
        @CurrentUser('id') userId: string,
        @Body()
        body: RemoveUnicodeReactionRequestDTO | RemoveCustomReactionRequestDTO,
    ): Promise<{ reactions: ReactionData[] }> {
        await assertHttpNotMuted(this.muteRepo, userId, 'remove reactions');
        await assertHttpNotWarned(this.warningRepo, userId, 'remove reactions');
        const emoji = body.emoji;
        const emojiId = 'emojiId' in body ? body.emojiId : undefined;
        const scope = body.scope;

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_SERVER_MEMBER);
        }

        const channel = await this.channelRepo.findById(channelId);
        if (channel === null || channel.serverId.toString() !== serverId) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const message = await this.serverMessageRepo.findById(messageId);
        if (message === null || message.channelId.toString() !== channelId) {
            throw new ApiError(404, ErrorMessages.MESSAGE.NOT_FOUND);
        }

        const canManageReactions =
            await this.permissionService.hasChannelPermission(
                serverId,
                userId,
                channelId,
                'manageReactions',
            );

        let removed = false;
        let isModeratorAction = false;

        if (scope === 'me') {
            removed = await this.reactionRepo.removeReaction(
                messageId,
                'server',
                userId,
                emoji,
                emojiId,
            );
        } else if (canManageReactions) {
            // Bulk removal of all reactions for a specific emoji (requires management permissions)
            const deletedCount = await this.reactionRepo.removeEmojiFromMessage(
                messageId,
                'server',
                emoji,
                emojiId,
            );
            removed = deletedCount > 0;
            isModeratorAction = removed;
        } else {
            // Default to removing only the user's own reaction if scope is not 'me' but they lack management permissions
            removed = await this.reactionRepo.removeReaction(
                messageId,
                'server',
                userId,
                emoji,
                emojiId,
            );
        }

        if (removed !== true) {
            throw new ApiError(404, ErrorMessages.REACTION.REACTION_NOT_FOUND);
        }

        const reactions = await this.reactionRepo.getReactionsByMessage(
            messageId,
            'server',
            userId,
        );

        const event: IReactionRemovedEvent = {
            type: 'reaction_removed',
            payload: {
                messageId,
                userId,
                emoji: emoji ?? '',
                emojiType:
                    emojiId !== undefined && emojiId !== ''
                        ? 'custom'
                        : 'unicode',
                emojiId,
                messageType: 'server',
                serverId,
                channelId,
            },
        };

        this.wsServer.broadcastToServer(serverId, event);

        if (isModeratorAction) {
            await this.serverAuditLogService.createAndBroadcast({
                serverId: serverId,
                actorId: userId,
                actionType: 'reaction_clear',
                targetId: message.snowflakeId,
                targetType: 'message',
                metadata: {
                    channelId: message.channelId.toString(),
                },
            });
        }

        return { reactions };
    }

    @Get('servers/:serverId/channels/:channelId/messages/:messageId/reactions')
    @ApiOperation({ summary: 'Get server reactions' })
    @ApiOkResponse({
        type: ReactionsListResponseDTO,
        description: 'Reactions retrieved successfully',
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Not found' })
    public async getServerReactions(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('messageId') messageId: string,
        @CurrentUser('id') userId: string,
    ): Promise<{ reactions: ReactionData[] }> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_SERVER_MEMBER);
        }

        const channel = await this.channelRepo.findById(channelId);
        if (channel === null || channel.serverId.toString() !== serverId) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const message = await this.serverMessageRepo.findById(messageId);
        if (message === null || message.channelId.toString() !== channelId) {
            throw new ApiError(404, ErrorMessages.MESSAGE.NOT_FOUND);
        }

        const reactions = await this.reactionRepo.getReactionsByMessage(
            messageId,
            'server',
            userId,
        );
        return { reactions };
    }
}
