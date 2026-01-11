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
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type {
    IReactionRepository,
    ReactionData,
} from '@/di/interfaces/IReactionRepository';
import type { IMessageRepository } from '@/di/interfaces/IMessageRepository';
import type { IServerMessageRepository } from '@/di/interfaces/IServerMessageRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import { PermissionService } from '@/services/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';

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

@injectable()
@Controller('api/v1')
@ApiTags('Reactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ReactionController {
    constructor(
        @inject(TYPES.ReactionRepository)
        @Inject(TYPES.ReactionRepository)
        private reactionRepo: IReactionRepository,
        @inject(TYPES.MessageRepository)
        @Inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @inject(TYPES.ServerMessageRepository)
        @Inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @inject(TYPES.ServerMemberRepository)
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.ChannelRepository)
        @Inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @inject(TYPES.PermissionService)
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.WsServer)
        @Inject(TYPES.WsServer)
        private wsServer: IWsServer,
        @inject(TYPES.UserRepository)
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @inject(TYPES.FriendshipRepository)
        @Inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
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

        const message = await this.messageRepo.findById(messageId);
        if (!message) {
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

        const message = await this.messageRepo.findById(messageId);
        if (!message) {
            throw new ApiError(404, ErrorMessages.MESSAGE.NOT_FOUND);
        }

        if (
            message.senderId.toString() !== userId &&
            message.receiverId.toString() !== userId
        ) {
            throw new ApiError(403, ErrorMessages.REACTION.ACCESS_DENIED);
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
            if (
                error.message?.includes('already reacted') ||
                error.message?.includes('Maximum')
            ) {
                throw new ApiError(400, error.message);
            }
            throw err;
        }

        const areFriends = await this.friendshipRepo.areFriends(
            message.senderId.toString(),
            message.receiverId.toString(),
        );

        if (!areFriends) {
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

        const receiverId =
            message.senderId.toString() === userId
                ? message.receiverId.toString()
                : message.senderId.toString();

        // Broadcast reaction to both users
        const event: IReactionAddedEvent = {
            type: 'reaction_added',
            payload: {
                messageId,
                userId,
                username: (req as Request & { user: JWTPayload }).user.username,
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

        const message = await this.messageRepo.findById(messageId);
        if (!message) {
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
        if (!removed) {
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
                emoji: emoji!,
                emojiType: emojiId ? 'custom' : 'unicode',
                emojiId,
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
            serverId,
            userId,
        );
        if (!member) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_SERVER_MEMBER);
        }

        const channel = await this.channelRepo.findById(channelId);
        if (!channel || channel.serverId.toString() !== serverId) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const canAddReactions =
            await this.permissionService.hasChannelPermission(
                serverId,
                userId,
                channelId,
                'addReactions',
            );
        if (!canAddReactions) {
            throw new ApiError(
                403,
                ErrorMessages.REACTION.MISSING_PERMISSION_ADD,
            );
        }

        const message = await this.serverMessageRepo.findById(messageId);
        if (!message || message.channelId.toString() !== channelId) {
            throw new ApiError(404, ErrorMessages.MESSAGE.NOT_FOUND);
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
            if (
                error.message?.includes('already reacted') ||
                error.message?.includes('Maximum')
            ) {
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
                username: (req as Request & { user: JWTPayload }).user.username,
                emoji,
                emojiType,
                emojiId,
                messageType: 'server',
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
            serverId,
            userId,
        );
        if (!member) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_SERVER_MEMBER);
        }

        const channel = await this.channelRepo.findById(channelId);
        if (!channel || channel.serverId.toString() !== serverId) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const message = await this.serverMessageRepo.findById(messageId);
        if (!message || message.channelId.toString() !== channelId) {
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

        if (!removed) {
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
                emoji: emoji!,
                emojiType: emojiId ? 'custom' : 'unicode',
                emojiId,
                messageType: 'server',
            },
        };

        this.wsServer.broadcastToServer(serverId, event);

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
            serverId,
            userId,
        );
        if (!member) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_SERVER_MEMBER);
        }

        const channel = await this.channelRepo.findById(channelId);
        if (!channel || channel.serverId.toString() !== serverId) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const message = await this.serverMessageRepo.findById(messageId);
        if (!message || message.channelId.toString() !== channelId) {
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
