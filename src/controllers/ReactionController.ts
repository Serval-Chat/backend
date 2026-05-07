import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    Req,
    UseGuards,
    Inject,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiBody,
} from '@nestjs/swagger';
import { injectable } from 'inversify';
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
import { BlockFlags } from '@/privacy/blockFlags';
import { PermissionService } from '@/permissions/PermissionService';

import type { IWsServer } from '@/ws/interfaces/IWsServer';
import { ErrorMessages } from '@/constants/errorMessages';
import { Request } from 'express';
import { JWTPayload } from '@/utils/jwt';
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
import { Types } from 'mongoose';

@injectable()
@Controller('api/v1')
@ApiTags('Reactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
    ) {}

    @Get('messages/:messageId/reactions')
    @ApiOperation({ summary: 'Get DM reactions' })
    @ApiResponse({
        status: 200,
        description: 'Reactions retrieved successfully',
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Message not found' })
    public async getDmReactions(
        @Param('messageId') messageId: string,
        @Req() req: Request,
    ): Promise<{ reactions: ReactionData[] }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;

        const message = await this.messageRepo.findById(
            new Types.ObjectId(messageId),
        );
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
            new Types.ObjectId(messageId),
            'dm',
            new Types.ObjectId(userId),
        );
        return { reactions };
    }

    @Post('messages/:messageId/reactions')
    @ApiOperation({ summary: 'Add reaction to DM' })
    @ApiBody({
        schema: {
            oneOf: [
                { $ref: '#/components/schemas/AddUnicodeReactionRequestDTO' },
                { $ref: '#/components/schemas/AddCustomReactionRequestDTO' },
            ],
        },
    })
    @ApiResponse({ status: 201, description: 'Reaction added' })
    @ApiResponse({ status: 400, description: 'Invalid emoji or limit reached' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Message not found' })
    public async addDmReaction(
        @Param('messageId') messageId: string,
        @Req() req: Request,
        @Body()
        body: AddUnicodeReactionRequestDTO | AddCustomReactionRequestDTO,
    ): Promise<{ reactions: ReactionData[] }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const { emoji, emojiType } = body;
        const emojiId =
            emojiType === 'custom'
                ? (body as AddCustomReactionRequestDTO).emojiId
                : undefined;

        const message = await this.messageRepo.findById(
            new Types.ObjectId(messageId),
        );
        if (message === null) {
            throw new ApiError(404, ErrorMessages.MESSAGE.NOT_FOUND);
        }

        const receiverId =
            message.senderId.toString() === userId
                ? message.receiverId.toString()
                : message.senderId.toString();

        const blockFlags = await this.blockRepo.getActiveBlockFlags(
            new Types.ObjectId(receiverId),
            new Types.ObjectId(userId),
        );

        if ((blockFlags & BlockFlags.BLOCK_REACTIONS) !== 0) {
            const reactions = await this.reactionRepo.getReactionsByMessage(
                new Types.ObjectId(messageId),
                'dm',
                new Types.ObjectId(userId),
            );
            return { reactions };
        }

        try {
            await this.reactionRepo.addReaction(
                new Types.ObjectId(messageId),
                'dm',
                new Types.ObjectId(userId),
                emoji,
                emojiType,
                emojiId,
            );
        } catch (err: unknown) {
            const error = err as Error;
            if (
                error.message.includes('already reacted') ||
                error.message.includes('Maximum')
            ) {
                throw new ApiError(400, error.message);
            }
            throw err;
        }

        const areFriends = await this.friendshipRepo.areFriends(
            new Types.ObjectId(message.senderId.toString()),
            new Types.ObjectId(message.receiverId.toString()),
        );

        if (areFriends !== true) {
            await this.reactionRepo.removeReaction(
                new Types.ObjectId(messageId),
                'dm',
                new Types.ObjectId(userId),
                emoji,
                emojiId,
            );
            throw new ApiError(403, ErrorMessages.REACTION.ACCESS_DENIED);
        }

        const reactions = await this.reactionRepo.getReactionsByMessage(
            new Types.ObjectId(messageId),
            'dm',
            new Types.ObjectId(userId),
        );

        // Broadcast reaction to both users
        const event: IReactionAddedEvent = {
            type: 'reaction_added',
            payload: {
                messageId,
                userId,
                username:
                    (req as Request & { user: JWTPayload }).user.username || '',
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
                    $ref: '#/components/schemas/RemoveUnicodeReactionRequestDTO',
                },
                { $ref: '#/components/schemas/RemoveCustomReactionRequestDTO' },
            ],
        },
    })
    @ApiResponse({ status: 200, description: 'Reaction removed' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Message not found' })
    public async removeDmReaction(
        @Param('messageId') messageId: string,
        @Req() req: Request,
        @Body()
        body: RemoveUnicodeReactionRequestDTO | RemoveCustomReactionRequestDTO,
    ): Promise<{ reactions: ReactionData[] }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const emoji = body.emoji;
        const emojiId = 'emojiId' in body ? body.emojiId : undefined;

        const message = await this.messageRepo.findById(
            new Types.ObjectId(messageId),
        );
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
            new Types.ObjectId(messageId),
            'dm',
            new Types.ObjectId(userId),
            emoji,
            emojiId,
        );
        if (removed !== true) {
            throw new ApiError(404, ErrorMessages.REACTION.REACTION_NOT_FOUND);
        }

        const reactions = await this.reactionRepo.getReactionsByMessage(
            new Types.ObjectId(messageId),
            'dm',
            new Types.ObjectId(userId),
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
                { $ref: '#/components/schemas/AddUnicodeReactionRequestDTO' },
                { $ref: '#/components/schemas/AddCustomReactionRequestDTO' },
            ],
        },
    })
    @ApiResponse({ status: 201, description: 'Reaction added' })
    @ApiResponse({ status: 400, description: 'Invalid emoji or limit reached' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Message or channel not found' })
    public async addServerReaction(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('messageId') messageId: string,
        @Req() req: Request,
        @Body()
        body: AddUnicodeReactionRequestDTO | AddCustomReactionRequestDTO,
    ): Promise<{ reactions: ReactionData[] }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const { emoji, emojiType } = body;
        const emojiId =
            emojiType === 'custom'
                ? (body as AddCustomReactionRequestDTO).emojiId
                : undefined;

        const member = await this.serverMemberRepo.findByServerAndUser(
            new Types.ObjectId(serverId),
            new Types.ObjectId(userId),
        );
        if (member === null) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_SERVER_MEMBER);
        }

        const channel = await this.channelRepo.findById(
            new Types.ObjectId(channelId),
        );
        if (channel === null || channel.serverId.toString() !== serverId) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const canAddReactions =
            await this.permissionService.hasChannelPermission(
                new Types.ObjectId(serverId),
                new Types.ObjectId(userId),
                new Types.ObjectId(channelId),
                'addReactions',
            );
        if (canAddReactions !== true) {
            throw new ApiError(
                403,
                ErrorMessages.REACTION.MISSING_PERMISSION_ADD,
            );
        }

        const message = await this.serverMessageRepo.findById(
            new Types.ObjectId(messageId),
        );
        if (message === null || message.channelId.toString() !== channelId) {
            throw new ApiError(404, ErrorMessages.MESSAGE.NOT_FOUND);
        }

        const blockFlags = await this.blockRepo.getActiveBlockFlags(
            message.senderId,
            new Types.ObjectId(userId),
        );

        if ((blockFlags & BlockFlags.BLOCK_REACTIONS) !== 0) {
            const reactions = await this.reactionRepo.getReactionsByMessage(
                new Types.ObjectId(messageId),
                'server',
                new Types.ObjectId(userId),
            );
            return { reactions };
        }

        try {
            await this.reactionRepo.addReaction(
                new Types.ObjectId(messageId),
                'server',
                new Types.ObjectId(userId),
                emoji,
                emojiType,
                emojiId,
            );
        } catch (err: unknown) {
            const error = err as Error;
            if (
                error.message.includes('already reacted') ||
                error.message.includes('Maximum')
            ) {
                throw new ApiError(400, error.message);
            }
            throw err;
        }

        const reactions = await this.reactionRepo.getReactionsByMessage(
            new Types.ObjectId(messageId),
            'server',
            new Types.ObjectId(userId),
        );

        const event: IReactionAddedEvent = {
            type: 'reaction_added',
            payload: {
                messageId,
                userId,
                username: (req as Request & { user: JWTPayload }).user.username,
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
                    $ref: '#/components/schemas/RemoveUnicodeReactionRequestDTO',
                },
                { $ref: '#/components/schemas/RemoveCustomReactionRequestDTO' },
            ],
        },
    })
    @ApiResponse({ status: 200, description: 'Reaction removed' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Message or channel not found' })
    public async removeServerReaction(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('messageId') messageId: string,
        @Req() req: Request,
        @Body()
        body: RemoveUnicodeReactionRequestDTO | RemoveCustomReactionRequestDTO,
    ): Promise<{ reactions: ReactionData[] }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const emoji = body.emoji;
        const emojiId = 'emojiId' in body ? body.emojiId : undefined;
        const scope = body.scope;

        const member = await this.serverMemberRepo.findByServerAndUser(
            new Types.ObjectId(serverId),
            new Types.ObjectId(userId),
        );
        if (member === null) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_SERVER_MEMBER);
        }

        const channel = await this.channelRepo.findById(
            new Types.ObjectId(channelId),
        );
        if (channel === null || channel.serverId.toString() !== serverId) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const message = await this.serverMessageRepo.findById(
            new Types.ObjectId(messageId),
        );
        if (message === null || message.channelId.toString() !== channelId) {
            throw new ApiError(404, ErrorMessages.MESSAGE.NOT_FOUND);
        }

        const canManageReactions =
            await this.permissionService.hasChannelPermission(
                new Types.ObjectId(serverId),
                new Types.ObjectId(userId),
                new Types.ObjectId(channelId),
                'manageReactions',
            );

        let removed = false;
        let isModeratorAction = false;

        if (scope === 'me') {
            removed = await this.reactionRepo.removeReaction(
                new Types.ObjectId(messageId),
                'server',
                new Types.ObjectId(userId),
                emoji,
                emojiId,
            );
        } else if (canManageReactions) {
            // Bulk removal of all reactions for a specific emoji (requires management permissions)
            const deletedCount = await this.reactionRepo.removeEmojiFromMessage(
                new Types.ObjectId(messageId),
                'server',
                emoji,
                emojiId,
            );
            removed = deletedCount > 0;
            isModeratorAction = removed;
        } else {
            // Default to removing only the user's own reaction if scope is not 'me' but they lack management permissions
            removed = await this.reactionRepo.removeReaction(
                new Types.ObjectId(messageId),
                'server',
                new Types.ObjectId(userId),
                emoji,
                emojiId,
            );
        }

        if (removed !== true) {
            throw new ApiError(404, ErrorMessages.REACTION.REACTION_NOT_FOUND);
        }

        const reactions = await this.reactionRepo.getReactionsByMessage(
            new Types.ObjectId(messageId),
            'server',
            new Types.ObjectId(userId),
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
            const serverOid = new Types.ObjectId(serverId);
            const userOid = new Types.ObjectId(userId);
            const messageOid = message._id;

            await this.serverAuditLogService.createAndBroadcast({
                serverId: serverOid,
                actorId: userOid,
                actionType: 'reaction_clear',
                targetId: messageOid,
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
    @ApiResponse({
        status: 200,
        description: 'Reactions retrieved successfully',
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Not found' })
    public async getServerReactions(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('messageId') messageId: string,
        @Req() req: Request,
    ): Promise<{ reactions: ReactionData[] }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;

        const member = await this.serverMemberRepo.findByServerAndUser(
            new Types.ObjectId(serverId),
            new Types.ObjectId(userId),
        );
        if (member === null) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_SERVER_MEMBER);
        }

        const channel = await this.channelRepo.findById(
            new Types.ObjectId(channelId),
        );
        if (channel === null || channel.serverId.toString() !== serverId) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const message = await this.serverMessageRepo.findById(
            new Types.ObjectId(messageId),
        );
        if (message === null || message.channelId.toString() !== channelId) {
            throw new ApiError(404, ErrorMessages.MESSAGE.NOT_FOUND);
        }

        const reactions = await this.reactionRepo.getReactionsByMessage(
            new Types.ObjectId(messageId),
            'server',
            new Types.ObjectId(userId),
        );
        return { reactions };
    }
}
