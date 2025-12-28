import {
    Controller,
    Get,
    Post,
    Delete,
    Route,
    Body,
    Path,
    Security,
    Response,
    Tags,
    Request,
} from 'tsoa';
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
import { PermissionService } from '@/services/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';
import { getIO } from '@/socket';
import { PresenceService } from '@/realtime/services/PresenceService';
import express from 'express';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';

/**
 * @example {
 *   "emoji": "👍",
 *   "emojiType": "unicode"
 * }
 */
interface AddUnicodeReactionRequest {
    /**
     * The unicode emoji character.
     * @example "👍"
     */
    emoji: string;
    /**
     * The type of emoji.
     * @example "unicode"
     */
    emojiType: 'unicode';
}

/**
 * @example {
 *   "emoji": "party_blob",
 *   "emojiType": "custom",
 *   "emojiId": "60d5ecb8b5c9c62b3c7c4b5e"
 * }
 */
interface AddCustomReactionRequest {
    /**
     * The name of the custom emoji.
     * @example "party_blob"
     */
    emoji: string;
    /**
     * The type of emoji.
     * @example "custom"
     */
    emojiType: 'custom';
    /**
     * The ID of the custom emoji.
     * @example "60d5ecb8b5c9c62b3c7c4b5e"
     */
    emojiId: string;
}

type AddReactionRequest = AddUnicodeReactionRequest | AddCustomReactionRequest;

/**
 * @example {
 *   "emoji": "👍",
 *   "scope": "me"
 * }
 */
interface RemoveUnicodeReactionRequest {
    /**
     * The emoji to remove.
     * @example "👍"
     */
    emoji: string;
    /**
     * Scope of removal.
     * @example "me"
     */
    scope?: 'me' | 'all';
}

/**
 * @example {
 *   "emojiId": "60d5ecb8b5c9c62b3c7c4b5e",
 *   "scope": "me"
 * }
 */
interface RemoveCustomReactionRequest {
    /**
     * The ID of the custom emoji to remove.
     * @example "60d5ecb8b5c9c62b3c7c4b5e"
     */
    emojiId: string;
    /**
     * Optional name of the custom emoji.
     * @example "party_blob"
     */
    emoji?: string;
    /**
     * Scope of removal.
     * @example "me"
     */
    scope?: 'me' | 'all';
}

type RemoveReactionRequest =
    | RemoveUnicodeReactionRequest
    | RemoveCustomReactionRequest;

/**
 * Controller for managing message reactions in DMs and servers.
 * Enforces message ownership and server/channel permission checks.
 */
@injectable()
@Route('api/v1')
@Tags('Reactions')
@Security('jwt')
export class ReactionController extends Controller {
    constructor(
        @inject(TYPES.ReactionRepository)
        private reactionRepo: IReactionRepository,
        @inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.PresenceService) private presenceService: PresenceService,
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {
        super();
    }

    /**
     * Retrieves reactions for a specific DM message.
     * Enforces that the requester is either the sender or receiver of the DM.
     */
    @Get('messages/{messageId}/reactions')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.REACTION.ACCESS_DENIED,
    })
    @Response<ErrorResponse>('404', 'Message Not Found', {
        error: ErrorMessages.MESSAGE.NOT_FOUND,
    })
    public async getDmReactions(
        @Path() messageId: string,
        @Request() req: express.Request,
    ): Promise<{ reactions: ReactionData[] }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;

        const message = await this.messageRepo.findById(messageId);
        if (!message) {
            this.setStatus(404);
            return { error: ErrorMessages.MESSAGE.NOT_FOUND } as any;
        }

        if (
            message.senderId.toString() !== userId &&
            message.receiverId.toString() !== userId
        ) {
            this.setStatus(403);
            return { error: ErrorMessages.REACTION.ACCESS_DENIED } as any;
        }

        const reactions = await this.reactionRepo.getReactionsByMessage(
            messageId,
            'dm',
            userId,
        );
        return { reactions };
    }

    /**
     * Adds a reaction to a DM message.
     * Enforces DM participation and maximum reaction limits.
     */
    @Post('messages/{messageId}/reactions')
    @Security('jwt')
    @Response<ErrorResponse>('400', 'Invalid emoji or limit reached', {
        error: ErrorMessages.REACTION.MAX_REACTIONS,
    })
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.REACTION.ACCESS_DENIED,
    })
    @Response<ErrorResponse>('404', 'Message not found', {
        error: ErrorMessages.MESSAGE.NOT_FOUND,
    })
    public async addDmReaction(
        @Path() messageId: string,
        @Request() req: express.Request,
        @Body() body: AddReactionRequest,
    ): Promise<{ reactions: ReactionData[] }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        const { emoji, emojiType } = body;
        const emojiId = emojiType === 'custom' ? body.emojiId : undefined;

        const message = await this.messageRepo.findById(messageId);
        if (!message) {
            this.setStatus(404);
            return { error: ErrorMessages.MESSAGE.NOT_FOUND } as any;
        }

        if (
            message.senderId.toString() !== userId &&
            message.receiverId.toString() !== userId
        ) {
            this.setStatus(403);
            return { error: ErrorMessages.REACTION.ACCESS_DENIED } as any;
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
        } catch (err: any) {
            // Handle repository-level validation errors (e.g., duplicate reaction, max limit)
            if (
                err.message?.includes('already reacted') ||
                err.message?.includes('Maximum')
            ) {
                this.setStatus(400);
                return { error: err.message } as any;
            }
            throw err;
        }

        const reactions = await this.reactionRepo.getReactionsByMessage(
            messageId,
            'dm',
            userId,
        );

        const io = getIO();
        const receiverId =
            message.senderId.toString() === userId
                ? message.receiverId.toString()
                : message.senderId.toString();

        // Notify both participants
        for (const uid of [userId, receiverId]) {
            const user = await this.userRepo.findById(uid);
            if (user?.username) {
                const sockets = this.presenceService.getSockets(user.username);
                sockets.forEach((sid: string) => {
                    io.to(sid).emit('reaction_added', {
                        messageId,
                        messageType: 'dm',
                        reactions,
                    });
                });
            }
        }

        this.setStatus(201);
        return { reactions };
    }

    /**
     * Removes a reaction from a DM message.
     * Enforces DM participation and reaction existence.
     */
    @Delete('messages/{messageId}/reactions')
    @Security('jwt')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.REACTION.ACCESS_DENIED,
    })
    @Response<ErrorResponse>('404', 'Message not found', {
        error: ErrorMessages.MESSAGE.NOT_FOUND,
    })
    public async removeDmReaction(
        @Path() messageId: string,
        @Request() req: express.Request,
        @Body() body: RemoveReactionRequest,
    ): Promise<{ reactions: ReactionData[] }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        const emoji = body.emoji;
        const emojiId = 'emojiId' in body ? body.emojiId : undefined;

        const message = await this.messageRepo.findById(messageId);
        if (!message) {
            this.setStatus(404);
            return { error: ErrorMessages.MESSAGE.NOT_FOUND } as any;
        }

        if (
            message.senderId.toString() !== userId &&
            message.receiverId.toString() !== userId
        ) {
            this.setStatus(403);
            return { error: ErrorMessages.REACTION.ACCESS_DENIED } as any;
        }

        const removed = await this.reactionRepo.removeReaction(
            messageId,
            'dm',
            userId,
            emoji,
            emojiId,
        );
        if (!removed) {
            this.setStatus(404);
            return { error: ErrorMessages.REACTION.REACTION_NOT_FOUND } as any;
        }

        const reactions = await this.reactionRepo.getReactionsByMessage(
            messageId,
            'dm',
            userId,
        );

        const io = getIO();
        const receiverId =
            message.senderId.toString() === userId
                ? message.receiverId.toString()
                : message.senderId.toString();

        // Notify both participants
        for (const uid of [userId, receiverId]) {
            const user = await this.userRepo.findById(uid);
            if (user?.username) {
                const sockets = this.presenceService.getSockets(user.username);
                sockets.forEach((sid: string) => {
                    io.to(sid).emit('reaction_removed', {
                        messageId,
                        messageType: 'dm',
                        reactions,
                    });
                });
            }
        }

        return { reactions };
    }

    /**
     * Adds a reaction to a server message.
     * Enforces server membership and 'addReactions' channel permission.
     */
    @Post(
        'servers/{serverId}/channels/{channelId}/messages/{messageId}/reactions',
    )
    @Security('jwt')
    @Response<ErrorResponse>('400', 'Invalid emoji or limit reached', {
        error: ErrorMessages.REACTION.MAX_REACTIONS,
    })
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Response<ErrorResponse>('404', 'Message or channel not found', {
        error: ErrorMessages.MESSAGE.NOT_FOUND,
    })
    public async addServerReaction(
        @Path() serverId: string,
        @Path() channelId: string,
        @Path() messageId: string,
        @Request() req: express.Request,
        @Body() body: AddReactionRequest,
    ): Promise<{ reactions: ReactionData[] }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        const { emoji, emojiType } = body;
        const emojiId = emojiType === 'custom' ? body.emojiId : undefined;

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(403);
            return { error: ErrorMessages.SERVER.NOT_SERVER_MEMBER } as any;
        }

        const channel = await this.channelRepo.findById(channelId);
        if (!channel || channel.serverId.toString() !== serverId) {
            this.setStatus(404);
            return { error: ErrorMessages.CHANNEL.NOT_FOUND } as any;
        }

        const canAddReactions =
            await this.permissionService.hasChannelPermission(
                serverId,
                userId,
                channelId,
                'addReactions',
            );
        if (!canAddReactions) {
            this.setStatus(403);
            return {
                error: ErrorMessages.REACTION.MISSING_PERMISSION_ADD,
            } as any;
        }

        const message = await this.serverMessageRepo.findById(messageId);
        if (!message || message.channelId.toString() !== channelId) {
            this.setStatus(404);
            return { error: ErrorMessages.MESSAGE.NOT_FOUND } as any;
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
        } catch (err: any) {
            if (
                err.message?.includes('already reacted') ||
                err.message?.includes('Maximum')
            ) {
                this.setStatus(400);
                return { error: err.message } as any;
            }
            throw err;
        }

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

        this.setStatus(201);
        return { reactions };
    }

    /**
     * Removes a reaction from a server message.
     * Enforces server membership and 'manageReactions' permission for bulk removal.
     */
    @Delete(
        'servers/{serverId}/channels/{channelId}/messages/{messageId}/reactions',
    )
    @Security('jwt')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Response<ErrorResponse>('404', 'Message or channel not found', {
        error: ErrorMessages.MESSAGE.NOT_FOUND,
    })
    public async removeServerReaction(
        @Path() serverId: string,
        @Path() channelId: string,
        @Path() messageId: string,
        @Request() req: express.Request,
        @Body() body: RemoveReactionRequest,
    ): Promise<{ reactions: ReactionData[] }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        const emoji = body.emoji;
        const emojiId = 'emojiId' in body ? body.emojiId : undefined;
        const scope = body.scope;

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(403);
            return { error: ErrorMessages.SERVER.NOT_SERVER_MEMBER } as any;
        }

        const channel = await this.channelRepo.findById(channelId);
        if (!channel || channel.serverId.toString() !== serverId) {
            this.setStatus(404);
            return { error: ErrorMessages.CHANNEL.NOT_FOUND } as any;
        }

        const message = await this.serverMessageRepo.findById(messageId);
        if (!message || message.channelId.toString() !== channelId) {
            this.setStatus(404);
            return { error: ErrorMessages.MESSAGE.NOT_FOUND } as any;
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
            this.setStatus(404);
            return { error: ErrorMessages.REACTION.REACTION_NOT_FOUND } as any;
        }

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

        return { reactions };
    }

    /**
     * Retrieves reactions for a specific server message.
     * Enforces server membership and message existence.
     */
    @Get(
        'servers/{serverId}/channels/{channelId}/messages/{messageId}/reactions',
    )
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NOT_SERVER_MEMBER,
    })
    @Response<ErrorResponse>('404', 'Not Found', {
        error: ErrorMessages.MESSAGE.NOT_FOUND,
    })
    public async getServerReactions(
        @Path() serverId: string,
        @Path() channelId: string,
        @Path() messageId: string,
        @Request() req: express.Request,
    ): Promise<{ reactions: ReactionData[] }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(403);
            return { error: ErrorMessages.SERVER.NOT_SERVER_MEMBER } as any;
        }

        const channel = await this.channelRepo.findById(channelId);
        if (!channel || channel.serverId.toString() !== serverId) {
            this.setStatus(404);
            return { error: ErrorMessages.CHANNEL.NOT_FOUND } as any;
        }

        const message = await this.serverMessageRepo.findById(messageId);
        if (!message || message.channelId.toString() !== channelId) {
            this.setStatus(404);
            return { error: ErrorMessages.MESSAGE.NOT_FOUND } as any;
        }

        const reactions = await this.reactionRepo.getReactionsByMessage(
            messageId,
            'server',
            userId,
        );
        return { reactions };
    }
}
