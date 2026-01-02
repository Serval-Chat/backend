import {
    Controller,
    Get,
    Patch,
    Delete,
    Route,
    Query,
    Path,
    Security,
    Response,
    Tags,
    Request,
    Body,
} from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import type {
    IMessageRepository,
    IMessage,
} from '@/di/interfaces/IMessageRepository';
import type { IDmUnreadRepository } from '@/di/interfaces/IDmUnreadRepository';
import type {
    IReactionRepository,
    ReactionData,
} from '@/di/interfaces/IReactionRepository';
import type { ILogger } from '@/di/interfaces/ILogger';
import express from 'express';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';

interface UnreadCountsResponse {
    counts: Record<string, number>;
}

interface MessageWithReactions extends IMessage {
    reactions: ReactionData[];
}

interface MessageResponse {
    message: IMessage;
    repliedMessage: IMessage | null;
}

interface UserEditMessageRequest {
    content: string;
}

// Controller for managing direct messages (DMs) between users
// Enforces friendship checks and conversation membership validation
@injectable()
@Route('api/v1/messages')
@Tags('User Messages')
@Security('jwt')
export class UserMessageController extends Controller {
    constructor(
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
        @inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @inject(TYPES.DmUnreadRepository)
        private dmUnreadRepo: IDmUnreadRepository,
        @inject(TYPES.ReactionRepository)
        private reactionRepo: IReactionRepository,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {
        super();
    }

    // Retrieves unread DM counts for the current user, grouped by peer
    @Get('unread')
    public async getUnreadCounts(
        @Request() req: express.Request,
    ): Promise<UnreadCountsResponse> {
        // @ts-ignore
        const meId = req.user.id;
        const docs = await this.dmUnreadRepo.findByUser(meId);

        // Map unread count documents to a simple peerId -> count record
        const unreadCounts: Record<string, number> = {};
        docs.forEach((doc) => {
            unreadCounts[doc.peer.toString()] = doc.count;
        });

        return { counts: unreadCounts };
    }

    // Retrieves messages between the current user and a specific peer
    // Enforces that both users are friends
    @Get()
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: 'User ID is required',
    })
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.FRIENDSHIP.NOT_FRIENDS,
    })
    @Response<ErrorResponse>('404', 'User Not Found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    public async getMessages(
        @Request() req: express.Request,
        @Query() userId: string,
        @Query() limit: number = 100,
        @Query() before?: string,
        @Query() around?: string,
    ): Promise<MessageWithReactions[]> {
        // @ts-ignore
        const meId = req.user.id;

        const userDoc = await this.userRepo.findById(userId);
        if (!userDoc) {
            this.setStatus(404);
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        }
        const otherUserId = userDoc._id.toString();

        // Only allow message retrieval if a friendship exists
        if (!(await this.friendshipRepo.areFriends(meId, otherUserId))) {
            this.setStatus(403);
            throw new Error(ErrorMessages.FRIENDSHIP.NOT_FRIENDS);
        }

        // Enforce an upper limit to prevent excessive data retrieval
        const messageLimit = Math.min(limit, 500);
        // Fetch messages using cursor-based pagination (before / around)
        const msgs = await this.messageRepo.findByConversation(
            meId,
            otherUserId,
            messageLimit,
            before,
            around,
        );

        // Bulk fetch reactions for all retrieved messages to avoid N+1 query patterns
        const messageIds = msgs.map((m) => m._id.toString());
        const reactionsMap = await this.reactionRepo.getReactionsForMessages(
            messageIds,
            'dm',
            meId,
        );

        const messagesWithReactions = msgs.map((msg) => {
            const msgObj = (msg as any).toObject
                ? (msg as any).toObject()
                : msg;
            return {
                ...msgObj,
                reactions: reactionsMap[msg._id.toString()] || [],
            };
        });

        return messagesWithReactions;
    }

    // Retrieves a specific message by ID
    // Enforces friendship and conversation membership
    @Get('{id}')
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: 'Invalid message ID',
    })
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.FRIENDSHIP.NOT_FRIENDS,
    })
    @Response<ErrorResponse>('404', 'Message Not Found', {
        error: ErrorMessages.MESSAGE.NOT_FOUND,
    })
    public async getMessage(
        @Path() id: string,
        @Request() req: express.Request,
        @Query() userId: string,
    ): Promise<MessageResponse> {
        // @ts-ignore
        const meId = req.user.id;

        const userDoc = await this.userRepo.findById(userId);
        if (!userDoc) {
            this.setStatus(404);
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        }
        const otherUserId = userDoc._id.toString();

        if (!(await this.friendshipRepo.areFriends(meId, otherUserId))) {
            this.setStatus(403);
            throw new Error(ErrorMessages.FRIENDSHIP.NOT_FRIENDS);
        }

        const targetMessage = await this.messageRepo.findById(id);
        if (!targetMessage) {
            this.setStatus(404);
            throw new Error(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        // Ensure the message actually belongs to the conversation between these two users
        const isPartOfConversation =
            (targetMessage.senderId.toString() === meId &&
                targetMessage.receiverId.toString() === otherUserId) ||
            (targetMessage.senderId.toString() === otherUserId &&
                targetMessage.receiverId.toString() === meId);

        if (!isPartOfConversation) {
            this.setStatus(403);
            throw new Error(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        let repliedMessage = null;
        // Resolve the replied-to message if it exists and belongs to the same conversation
        if (targetMessage.replyToId) {
            const repliedMsg = await this.messageRepo.findById(
                targetMessage.replyToId,
            );
            if (repliedMsg) {
                const isRepliedPartOfConversation =
                    (repliedMsg.senderId.toString() === meId &&
                        repliedMsg.receiverId.toString() === otherUserId) ||
                    (repliedMsg.senderId.toString() === otherUserId &&
                        repliedMsg.receiverId.toString() === meId);

                if (isRepliedPartOfConversation) {
                    repliedMessage = repliedMsg;
                }
            }
        }

        return { message: targetMessage, repliedMessage };
    }

    // Retrieves a single message by ID with friendship check (alternative route)
    // Enforces conversation membership
    @Get('{userId}/{messageId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.FRIENDSHIP.NOT_FRIENDS,
    })
    @Response<ErrorResponse>('404', 'Message Not Found', {
        error: ErrorMessages.MESSAGE.NOT_FOUND,
    })
    public async getUserMessage(
        @Path() userId: string,
        @Path() messageId: string,
        @Request() req: express.Request,
    ): Promise<MessageResponse> {
        // @ts-ignore
        const meId = req.user.id;

        // Ensure users are friends before allowing message access
        if (!(await this.friendshipRepo.areFriends(meId, userId))) {
            if (meId !== userId) {
                this.setStatus(403);
                throw new Error(ErrorMessages.FRIENDSHIP.NOT_FRIENDS);
            }
        }

        const message = await this.messageRepo.findById(messageId);
        if (!message) {
            this.setStatus(404);
            throw new Error(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        // Ensure the message actually belongs to the conversation between these two users
        const isPartOfConversation =
            (message.senderId.toString() === meId &&
                message.receiverId.toString() === userId) ||
            (message.senderId.toString() === userId &&
                message.receiverId.toString() === meId);

        if (!isPartOfConversation) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MESSAGE.NOT_IN_CONVERSATION);
        }

        let repliedMessage = null;
        // Resolve the replied-to message, handling both legacy and new ID fields
        if (message.repliedToMessageId) {
            repliedMessage = await this.messageRepo.findById(
                message.repliedToMessageId.toString(),
            );
        } else if (message.replyToId) {
            repliedMessage = await this.messageRepo.findById(message.replyToId);
        }

        return { message, repliedMessage };
    }

    // Edits an existing direct message
    // Enforces that only the original sender can edit their message
    @Patch('{id}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.AUTH.UNAUTHORIZED,
    })
    @Response<ErrorResponse>('404', 'Message Not Found', {
        error: ErrorMessages.MESSAGE.NOT_FOUND,
    })
    public async editMessage(
        @Path() id: string,
        @Request() req: express.Request,
        @Body() body: UserEditMessageRequest,
    ): Promise<IMessage> {
        // @ts-ignore
        const meId = req.user.id;
        const { content } = body;

        if (!content || !content.trim()) {
            this.setStatus(400);
            throw new Error(ErrorMessages.MESSAGE.CONTENT_REQUIRED);
        }

        const message = await this.messageRepo.findById(id);
        if (!message) {
            this.setStatus(404);
            throw new Error(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        // Only the sender is authorized to modify the message content
        if (message.senderId.toString() !== meId) {
            this.setStatus(403);
            throw new Error(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const updated = await this.messageRepo.update(id, content);
        // Mark message as edited for client-side rendering
        if (!updated) {
            this.setStatus(500);
            throw new Error(ErrorMessages.SYSTEM.INTERNAL_ERROR);
        }

        return updated;
    }

    // Deletes a direct message
    // Enforces that only the original sender can delete their message
    @Delete('{id}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.AUTH.UNAUTHORIZED,
    })
    @Response<ErrorResponse>('404', 'Message Not Found', {
        error: ErrorMessages.MESSAGE.NOT_FOUND,
    })
    public async deleteMessage(
        @Path() id: string,
        @Request() req: express.Request,
    ): Promise<{ success: boolean }> {
        // @ts-ignore
        const meId = req.user.id;

        const message = await this.messageRepo.findById(id);
        if (!message) {
            this.setStatus(404);
            throw new Error(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        // Only the sender is authorized to delete the message
        if (message.senderId.toString() !== meId) {
            this.setStatus(403);
            throw new Error(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const deleted = await this.messageRepo.delete(id);
        // Return deletion result without exposing internal deletion details
        return { success: deleted };
    }
}
