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
import type { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import type { IMessageRepository } from '@/di/interfaces/IMessageRepository';
import { PresenceService } from '@/realtime/services/PresenceService';
import type { ILogger } from '@/di/interfaces/ILogger';
import { getIO } from '@/socket';
import { type SerializedCustomStatus } from '@/utils/status';
import { mapUser } from '@/utils/user';
import express from 'express';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';

import { SendFriendRequestDTO } from './dto/friendship.request.dto';
import {
    FriendResponseDTO,
    IncomingFriendRequestResponseDTO,
    SendFriendRequestResponseDTO,
    AcceptFriendRequestResponseDTO,
    FriendshipMessageResponseDTO,
} from './dto/friendship.response.dto';

// Controller for managing user friendships and friend requests
// Enforces boundaries via ownership checks on requests and friendships
@injectable()
@Route('api/v1/friends')
@Tags('Friends')
@Security('jwt')
export class FriendshipController extends Controller {
    constructor(
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
        @inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @inject(TYPES.PresenceService) private presenceService: PresenceService,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {
        super();
    }

    // Maps a user document to a public friend payload
    private mapUserToFriendPayload(user: any): FriendResponseDTO | null {
        const mapped = mapUser(user);
        if (!mapped) return null;

        return {
            _id: mapped.id,
            username: mapped.username,
            displayName: mapped.displayName || undefined,
            createdAt: mapped.createdAt,
            profilePicture: mapped.profilePicture,
            customStatus: mapped.customStatus as SerializedCustomStatus | null,
        };
    }

    // Retrieves the current user's friends list, sorted by latest message activity
    @Get()
    public async getFriends(
        @Request() req: express.Request,
    ): Promise<FriendResponseDTO[]> {
        // @ts-ignore
        const userId = req.user.id;

        const me = await this.userRepo.findById(userId);
        if (!me) {
            this.setStatus(401);
            throw new Error(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const friendships = await this.friendshipRepo.findByUserId(userId);
        const friendIds = new Set<string>();
        const legacyUsernames = new Set<string>();

        // Extract friend identifiers from both modern (ID-based) and legacy (username-based) friendships
        friendships.forEach((rel: any) => {
            const userIdStr = rel.userId?.toString() || rel.userId;
            const friendIdStr = rel.friendId?.toString() || rel.friendId;
            const otherId = userIdStr === userId ? friendIdStr : userIdStr;

            if (otherId && otherId !== userId) {
                friendIds.add(otherId);
            } else if (rel.friend) {
                legacyUsernames.add(rel.friend);
            }
        });

        const friendsById = [];
        for (const friendId of Array.from(friendIds)) {
            const friend = await this.userRepo.findById(friendId);
            if (friend) friendsById.push(friend);
        }

        friendsById.forEach((doc: any) => {
            legacyUsernames.delete(doc.username);
        });

        const friendsByUsername = [];
        for (const username of Array.from(legacyUsernames)) {
            const friend = await this.userRepo.findByUsername(username);
            if (friend) friendsByUsername.push(friend);
        }

        const combinedFriends = [...friendsById, ...friendsByUsername];

        // Enrichment with latest message timestamp for sorting
        const friendsWithLatestMessage = await Promise.all(
            combinedFriends.map(async (friend: any) => {
                const messages = await this.messageRepo.findByConversation(
                    userId,
                    friend._id?.toString() || friend._id,
                    1,
                );
                const latestMessage = messages.length > 0 ? messages[0] : null;

                return {
                    friend,
                    latestMessageAt: latestMessage
                        ? latestMessage.createdAt
                            ? new Date(latestMessage.createdAt).toISOString()
                            : null
                        : null,
                };
            }),
        );

        // Sorting by activity: most recent messages first
        friendsWithLatestMessage.sort((a, b) => {
            if (a.latestMessageAt === null && b.latestMessageAt === null)
                return 0;
            if (a.latestMessageAt === null) return 1;
            if (b.latestMessageAt === null) return -1;
            return (
                new Date(b.latestMessageAt).getTime() -
                new Date(a.latestMessageAt).getTime()
            );
        });

        return friendsWithLatestMessage
            .map(({ friend, latestMessageAt }) => {
                const payload = this.mapUserToFriendPayload(friend);
                if (payload) {
                    payload.latestMessageAt = latestMessageAt;

                    // Handling deleted user profile picture
                    if (friend.deletedAt) {
                        payload.profilePicture = '/images/deleted-cat.jpg';
                    }
                }
                return payload as FriendResponseDTO;
            })
            .filter((p) => p !== null);
    }

    // Retrieves pending incoming friend requests
    @Get('incoming')
    public async getIncomingRequests(
        @Request() req: express.Request,
    ): Promise<IncomingFriendRequestResponseDTO[]> {
        // @ts-ignore
        const userId = req.user.id;
        const incoming =
            await this.friendshipRepo.findPendingRequestsFor(userId);

        return await Promise.all(
            incoming.map(async (r) => {
                let fromUsername = r.from;
                if (!fromUsername && r.fromId) {
                    const fromUser = await this.userRepo.findById(
                        r.fromId.toString(),
                    );
                    fromUsername = fromUser?.username;
                }

                return {
                    _id: r._id.toString(),
                    from: fromUsername,
                    fromId: r.fromId?.toString(),
                    createdAt: r.createdAt || new Date(),
                };
            }),
        );
    }

    // Sends a friend request to another user
    @Post()
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: ErrorMessages.FRIENDSHIP.USERNAME_REQUIRED,
    })
    @Response<ErrorResponse>('404', 'User Not Found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    public async sendFriendRequest(
        @Request() req: express.Request,
        @Body() body: SendFriendRequestDTO,
    ): Promise<SendFriendRequestResponseDTO> {
        // @ts-ignore
        const meId = req.user.id;
        const meUser = await this.userRepo.findById(meId);
        if (!meUser) {
            this.setStatus(401);
            throw new Error(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const { username: friendUsername } = body;
        if (!friendUsername) {
            this.setStatus(400);
            throw new Error(ErrorMessages.FRIENDSHIP.USERNAME_REQUIRED);
        }

        const friendUser = await this.userRepo.findByUsername(friendUsername);
        if (!friendUser) {
            this.setStatus(404);
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const friendId = friendUser._id.toString();
        if (friendId === meId) {
            this.setStatus(400);
            throw new Error(ErrorMessages.FRIENDSHIP.CANNOT_ADD_SELF);
        }

        if (await this.friendshipRepo.areFriends(meId, friendId)) {
            this.setStatus(400);
            throw new Error(ErrorMessages.FRIENDSHIP.ALREADY_FRIENDS);
        }

        const existingRequest = await this.friendshipRepo.findExistingRequest(
            meId,
            friendId,
        );
        if (existingRequest) {
            if (existingRequest.status === 'pending') {
                this.setStatus(400);
                throw new Error(ErrorMessages.FRIENDSHIP.REQUEST_ALREADY_SENT);
            }
            await this.friendshipRepo.rejectRequest(
                existingRequest._id.toString(),
            );
        }

        const reqDoc = await this.friendshipRepo.createRequest(meId, friendId);

        const requestPayload = {
            _id: reqDoc._id.toString(),
            from: meUser.username,
            fromId: meId,
            createdAt:
                reqDoc.createdAt instanceof Date
                    ? reqDoc.createdAt.toISOString()
                    : new Date().toISOString(),
        };

        try {
            const io = getIO();
            const targetUsername = friendUser.username || '';
            const recipientSockets =
                this.presenceService.getSockets(targetUsername);

            if (recipientSockets) {
                recipientSockets.forEach((sid) =>
                    io.to(sid).emit('incoming_request_added', requestPayload),
                );
            }
        } catch (err) {
            this.logger.error(
                'Failed to emit incoming_request_added event:',
                err,
            );
        }

        this.setStatus(211); // Note: Original was 201, but the corrupted one had 211? No, 201.
        // Wait, I see 211 in my thought but the code had 201. Let's use 201.
        this.setStatus(201);
        return {
            message: 'friend request sent',
            request: reqDoc,
        };
    }

    // Accepts a friend request and establishes a mutual friendship
    @Post('{id}/accept')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.FRIENDSHIP.NOT_ALLOWED,
    })
    @Response<ErrorResponse>('404', 'Not Found', {
        error: ErrorMessages.FRIENDSHIP.REQUEST_NOT_FOUND,
    })
    public async acceptFriendRequest(
        @Path() id: string,
        @Request() req: express.Request,
    ): Promise<AcceptFriendRequestResponseDTO> {
        // @ts-ignore
        const meId = req.user.id;
        const meUser = await this.userRepo.findById(meId);
        if (!meUser) {
            this.setStatus(401);
            throw new Error(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const fr = await this.friendshipRepo.findRequestById(id);
        if (!fr) {
            this.setStatus(404);
            throw new Error(ErrorMessages.FRIENDSHIP.REQUEST_NOT_FOUND);
        }

        // Verification of the recipient
        if (fr.toId?.toString() !== meId) {
            this.setStatus(403);
            throw new Error(ErrorMessages.FRIENDSHIP.NOT_ALLOWED);
        }

        if (fr.status !== 'pending') {
            this.setStatus(400);
            throw new Error(ErrorMessages.FRIENDSHIP.REQUEST_NOT_PENDING);
        }

        const fromId = fr.fromId?.toString() || '';
        const toId = fr.toId?.toString() || '';

        const [fromUser, toUser] = await Promise.all([
            this.userRepo.findById(fromId),
            this.userRepo.findById(toId),
        ]);

        if (!fromUser || !toUser) {
            this.setStatus(404);
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        await this.friendshipRepo.create(fromId, toId);
        await this.friendshipRepo.create(toId, fromId);

        const fromFriendPayload = this.mapUserToFriendPayload(fromUser);
        const toFriendPayload = this.mapUserToFriendPayload(toUser);

        try {
            const io = getIO();
            const toUsername = toUser.username || '';
            const toSockets = this.presenceService.getSockets(toUsername);

            if (toSockets && fromFriendPayload) {
                toSockets.forEach((sid) => {
                    io.to(sid).emit('friend_added', {
                        friend: fromFriendPayload,
                    });
                    io.to(sid).emit('incoming_request_removed', {
                        from: fromUser.username,
                        fromId: fromFriendPayload?._id,
                    });
                });
            }

            const fromUsername = fromUser.username || '';
            const fromSockets = this.presenceService.getSockets(fromUsername);

            if (fromSockets && toFriendPayload) {
                fromSockets.forEach((sid) => {
                    io.to(sid).emit('friend_added', {
                        friend: toFriendPayload,
                    });
                });
            }
        } catch (err) {
            this.logger.error('Failed to emit friend_added events:', err);
        }

        await this.friendshipRepo.acceptRequest(id);

        return {
            message: 'friend request accepted',
            friend: fromFriendPayload,
        };
    }

    // Rejects a pending friend request
    @Post('{id}/reject')
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: ErrorMessages.FRIENDSHIP.REQUEST_NOT_PENDING,
    })
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.FRIENDSHIP.NOT_ALLOWED,
    })
    @Response<ErrorResponse>('404', 'Not Found', {
        error: ErrorMessages.FRIENDSHIP.REQUEST_NOT_FOUND,
    })
    public async rejectFriendRequest(
        @Path() id: string,
        @Request() req: express.Request,
    ): Promise<FriendshipMessageResponseDTO> {
        // @ts-ignore
        const meId = req.user.id;
        const fr = await this.friendshipRepo.findRequestById(id);

        if (!fr) {
            this.setStatus(404);
            throw new Error(ErrorMessages.FRIENDSHIP.REQUEST_NOT_FOUND);
        }

        // Verification of the recipient
        if (fr.toId?.toString() !== meId) {
            this.setStatus(403);
            throw new Error(ErrorMessages.FRIENDSHIP.NOT_ALLOWED);
        }

        if (fr.status !== 'pending') {
            this.setStatus(400);
            throw new Error(ErrorMessages.FRIENDSHIP.REQUEST_NOT_PENDING);
        }

        const success = await this.friendshipRepo.rejectRequest(id);
        if (!success) {
            this.setStatus(404);
            throw new Error(ErrorMessages.FRIENDSHIP.REQUEST_NOT_FOUND);
        }

        return { message: 'friend request rejected' };
    }

    // Removes a user from the current user's friends list
    @Delete('{friendId}')
    @Response<ErrorResponse>('404', 'User Not Found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    public async removeFriend(
        @Path() friendId: string,
        @Request() req: express.Request,
    ): Promise<FriendshipMessageResponseDTO> {
        // @ts-ignore
        const meId = req.user.id;

        const [friend, meUser] = await Promise.all([
            this.userRepo.findById(friendId),
            this.userRepo.findById(meId),
        ]);

        if (!friend) {
            this.setStatus(404);
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        }
        if (!meUser) {
            this.setStatus(401);
            throw new Error(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        await this.friendshipRepo.remove(meId, friendId);

        try {
            const io = getIO();
            const mySockets = this.presenceService.getSockets(
                meUser.username || '',
            );
            if (mySockets) {
                mySockets.forEach((sid) =>
                    io.to(sid).emit('friend_removed', {
                        username: friend.username,
                        userId: friendId,
                    }),
                );
            }

            const friendSockets = this.presenceService.getSockets(
                friend.username || '',
            );
            if (friendSockets) {
                friendSockets.forEach((sid) =>
                    io.to(sid).emit('friend_removed', {
                        username: meUser.username,
                        userId: meId,
                    }),
                );
            }
        } catch (err) {
            this.logger.error('Failed to emit friend_removed event:', err);
        }

        return { message: 'Friend removed successfully' };
    }
}
