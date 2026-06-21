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
import { Types } from 'mongoose';
import { TYPES } from '@/di/types';
import { IUserRepository } from '@/di/interfaces/IUserRepository';
import { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import { IMessageRepository } from '@/di/interfaces/IMessageRepository';
import { WsServer } from '@/ws/server';
import { ILogger } from '@/di/interfaces/ILogger';
import type { IBlockRepository } from '@/di/interfaces/IBlockRepository';
import type { IDmUnreadRepository } from '@/di/interfaces/IDmUnreadRepository';
import { PingService } from '@/services/PingService';
import {
    ApiTags,
    ApiResponse,
    ApiOkResponse,
    ApiBearerAuth,
    ApiOperation,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { type SerializedCustomStatus } from '@/utils/status';
import { mapUser } from '@/utils/user';
import { Request } from 'express';
import { JWTPayload } from '@/utils/jwt';
import { ApiError } from '@/utils/ApiError';
import { ErrorMessages } from '@/constants/errorMessages';
import { notifyUser } from '@/services/PushService';
import { getDocumentId, getDocumentIdString } from '@/utils/mongooseId';

import { SendFriendRequestDTO } from './dto/friendship.request.dto';
import {
    FriendResponseDTO,
    IncomingFriendRequestResponseDTO,
    SendFriendRequestResponseDTO,
    AcceptFriendRequestResponseDTO,
    FriendshipMessageResponseDTO,
    OutgoingFriendRequestResponseDTO,
} from './dto/friendship.response.dto';

interface RequestWithUser extends Request {
    user: JWTPayload;
}

import { NoBot } from '@/modules/auth/bot.decorator';

@ApiTags('Friends')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@NoBot()
@Controller('api/v1/friends')
export class FriendshipController {
    public constructor(
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @Inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
        @Inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @Inject(TYPES.WsServer)
        private wsServer: WsServer,
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @Inject(TYPES.BlockRepository)
        private blockRepo: IBlockRepository,
        @Inject(TYPES.PingService)
        private pingService: PingService,
        @Inject(TYPES.DmUnreadRepository)
        private dmUnreadRepo: IDmUnreadRepository,
    ) {}

    private mapUserToFriendPayload(user: unknown): FriendResponseDTO | null {
        const mapped = mapUser(user);
        if (mapped === null) return null;

        return {
            id: mapped.id,
            username: mapped.username,
            displayName:
                mapped.displayName !== null && mapped.displayName !== ''
                    ? mapped.displayName
                    : undefined,
            createdAt: mapped.createdAt,
            profilePicture: mapped.profilePicture,
            customStatus: mapped.customStatus as SerializedCustomStatus | null,
        };
    }

    @Get()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get friends list' })
    @ApiResponse({ status: 200, type: [FriendResponseDTO] })
    public async getFriends(@Req() req: Request): Promise<FriendResponseDTO[]> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const userOid = new Types.ObjectId(userId);

        const me = await this.userRepo.findById(userOid);
        if (me === null) {
            throw new ApiError(401, ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const friendships = await this.friendshipRepo.findByUserId(userOid);
        const friendIds = new Set<string>();
        const friendshipCreatedAtByFriendId = new Map<string, Date>();
        const isPinnedByFriendId = new Map<string, boolean>();
        const legacyUsernames = new Set<string>();

        friendships.forEach((rel) => {
            const userIdStr = rel.userId.toString();
            const friendIdStr = rel.friendId.toString();
            const otherId = userIdStr === userId ? friendIdStr : userIdStr;

            if (otherId !== '' && otherId !== userId) {
                friendIds.add(otherId);
                if (rel.createdAt !== undefined) {
                    const existing = friendshipCreatedAtByFriendId.get(otherId);
                    const createdAt = new Date(rel.createdAt);
                    if (
                        existing === undefined ||
                        createdAt.getTime() > existing.getTime()
                    ) {
                        friendshipCreatedAtByFriendId.set(otherId, createdAt);
                    }
                }
                if (userIdStr === userId && rel.isPinned === true) {
                    isPinnedByFriendId.set(otherId, true);
                }
            } else if (rel.friend !== undefined && rel.friend !== '') {
                legacyUsernames.add(rel.friend);
            }
        });

        const friendsById = [];
        for (const friendId of Array.from(friendIds)) {
            const friend = await this.userRepo.findById(
                new Types.ObjectId(friendId),
            );
            if (friend !== null) friendsById.push(friend);
        }

        friendsById.forEach((doc) => {
            if (doc.username !== undefined && doc.username !== '') {
                legacyUsernames.delete(doc.username);
            }
        });

        const friendsByUsername = [];
        for (const username of Array.from(legacyUsernames)) {
            const friend = await this.userRepo.findByUsername(username);
            if (friend !== null) friendsByUsername.push(friend);
        }

        const combinedFriends = [...friendsById, ...friendsByUsername];

        const friendsWithLatestMessage = await Promise.all(
            combinedFriends.map(async (friend) => {
                const friendId = getDocumentIdString(friend);
                if (friendId === '') {
                    return { friend, latestMessageAt: null };
                }
                const conversationMessages =
                    await this.messageRepo.findByConversation(
                        userOid,
                        new Types.ObjectId(friendId),
                        1,
                    );
                const latestMessage =
                    conversationMessages.length > 0
                        ? conversationMessages[0]
                        : null;

                return {
                    friend,
                    friendshipCreatedAt:
                        friendshipCreatedAtByFriendId.get(friendId) ?? null,
                    latestMessageAt:
                        latestMessage !== undefined && latestMessage !== null
                            ? latestMessage.createdAt !== undefined
                                ? new Date(
                                      latestMessage.createdAt,
                                  ).toISOString()
                                : null
                            : null,
                };
            }),
        );

        friendsWithLatestMessage.sort((a, b) => {
            if (a.latestMessageAt === null && b.latestMessageAt === null) {
                const aFriendshipCreatedAt = a.friendshipCreatedAt ?? null;
                const bFriendshipCreatedAt = b.friendshipCreatedAt ?? null;
                if (
                    aFriendshipCreatedAt === null &&
                    bFriendshipCreatedAt === null
                )
                    return 0;
                if (aFriendshipCreatedAt === null) return 1;
                if (bFriendshipCreatedAt === null) return -1;
                return (
                    bFriendshipCreatedAt.getTime() -
                    aFriendshipCreatedAt.getTime()
                );
            }
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
                if (payload !== null) {
                    payload.latestMessageAt = latestMessageAt;
                    payload.isPinned =
                        isPinnedByFriendId.get(payload.id) ?? false;

                    if (friend.deletedAt !== undefined) {
                        payload.profilePicture = '/images/deleted-cat.jpg';
                    }
                }
                return payload;
            })
            .filter((p): p is FriendResponseDTO => p !== null);
    }

    @Get('profiles')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({
        summary: 'Get full profiles for all friends in one request',
    })
    @ApiOkResponse({
        type: [FriendResponseDTO],
        description: 'Array of full user profiles',
    })
    public async getFriendProfiles(
        @Req() req: Request,
    ): Promise<FriendResponseDTO[]> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const userOid = new Types.ObjectId(userId);

        const friendships = await this.friendshipRepo.findByUserId(userOid);
        const friendIds = new Set<string>();
        const legacyUsernames = new Set<string>();

        friendships.forEach((rel) => {
            const userIdStr = rel.userId.toString();
            const friendIdStr = rel.friendId.toString();
            const otherId = userIdStr === userId ? friendIdStr : userIdStr;

            if (otherId !== '' && otherId !== userId) {
                friendIds.add(otherId);
            } else if (rel.friend !== undefined && rel.friend !== '') {
                legacyUsernames.add(rel.friend);
            }
        });

        const friendDocs = await Promise.all([
            ...Array.from(friendIds).map((id) =>
                this.userRepo.findById(new Types.ObjectId(id)),
            ),
            ...Array.from(legacyUsernames).map((username) =>
                this.userRepo.findByUsername(username),
            ),
        ]);

        const HIDE_PRONOUNS = 1 << 0;
        const HIDE_BIO = 1 << 1;
        const HIDE_DISPLAY_NAME = 1 << 2;
        const HIDE_AVATAR = 1 << 3;

        const profiles = await Promise.all(
            friendDocs
                .filter((u): u is NonNullable<typeof u> => u !== null)
                .map(async (user) => {
                    const mapped = mapUser(user) as Record<
                        string,
                        unknown
                    > | null;
                    if (mapped === null) return null;

                    const blockFlags = await this.blockRepo.getActiveBlockFlags(
                        getDocumentId(user) as Types.ObjectId,
                        userOid,
                    );

                    if ((blockFlags & HIDE_PRONOUNS) !== 0)
                        mapped.pronouns = undefined;
                    if ((blockFlags & HIDE_BIO) !== 0) mapped.bio = undefined;
                    if ((blockFlags & HIDE_DISPLAY_NAME) !== 0)
                        mapped.displayName = null;
                    if ((blockFlags & HIDE_AVATAR) !== 0)
                        mapped.profilePicture = null;

                    if (user.deletedAt !== undefined) {
                        mapped.profilePicture = '/images/deleted-cat.jpg';
                    }

                    return mapped as unknown as FriendResponseDTO;
                }),
        );

        return profiles.filter((p): p is FriendResponseDTO => p !== null);
    }

    @Get('incoming')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get incoming friend requests' })
    @ApiResponse({ status: 200, type: [IncomingFriendRequestResponseDTO] })
    public async getIncomingRequests(
        @Req() req: Request,
    ): Promise<IncomingFriendRequestResponseDTO[]> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const incoming = await this.friendshipRepo.findPendingRequestsFor(
            new Types.ObjectId(userId),
        );

        return await Promise.all(
            incoming.map(async (r) => {
                let fromUsername = r.from;
                if (fromUsername === undefined || fromUsername === '') {
                    const fromUser = await this.userRepo.findById(r.fromId);
                    fromUsername =
                        fromUser !== null ? fromUser.username : undefined;
                }

                return {
                    id: getDocumentIdString(r),
                    from: fromUsername,
                    fromId: r.fromId.toString(),
                    createdAt: r.createdAt || new Date(),
                };
            }),
        );
    }

    @Get('outgoing')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get outgoing friend requests' })
    @ApiResponse({ status: 200, type: [OutgoingFriendRequestResponseDTO] })
    public async getOutgoingRequests(
        @Req() req: Request,
    ): Promise<OutgoingFriendRequestResponseDTO[]> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const outgoing = await this.friendshipRepo.findPendingRequestsFrom(
            new Types.ObjectId(userId),
        );

        return await Promise.all(
            outgoing.map(async (r) => {
                let toUsername = r.to;
                if (toUsername === undefined || toUsername === '') {
                    const toUser = await this.userRepo.findById(r.toId);
                    toUsername = toUser !== null ? toUser.username : undefined;
                }

                return {
                    id: getDocumentIdString(r),
                    to: toUsername,
                    toId: r.toId.toString(),
                    createdAt: r.createdAt || new Date(),
                };
            }),
        );
    }

    @Post()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Send a friend request' })
    @ApiResponse({ status: 201, type: SendFriendRequestResponseDTO })
    @ApiResponse({
        status: 400,
        description: 'User not found or already friends',
    })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async sendFriendRequest(
        @Req() req: Request,
        @Body() body: SendFriendRequestDTO,
    ): Promise<SendFriendRequestResponseDTO> {
        const meId = (req as unknown as RequestWithUser).user.id;
        const meOid = new Types.ObjectId(meId);
        const meUser = await this.userRepo.findById(meOid);
        if (meUser === null) {
            throw new ApiError(401, ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const { username: friendUsername } = body;

        const friendUser = await this.userRepo.findByUsername(friendUsername);
        if (friendUser === null) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }
        if (friendUser.isBot === true) {
            throw new ApiError(400, ErrorMessages.FRIENDSHIP.CANNOT_ADD_BOT);
        }

        const friendId = getDocumentId(friendUser) as Types.ObjectId;
        const friendIdStr = friendId.toString();
        if (friendIdStr === meId) {
            throw new ApiError(400, ErrorMessages.FRIENDSHIP.CANNOT_ADD_SELF);
        }

        if (await this.friendshipRepo.areFriends(meOid, friendId)) {
            throw new ApiError(400, ErrorMessages.FRIENDSHIP.ALREADY_FRIENDS);
        }

        const existingRequest = await this.friendshipRepo.findExistingRequest(
            meOid,
            friendId,
        );
        if (existingRequest !== null) {
            if (existingRequest.status === 'pending') {
                throw new ApiError(
                    400,
                    ErrorMessages.FRIENDSHIP.REQUEST_ALREADY_SENT,
                );
            }
            await this.friendshipRepo.rejectRequest(
                getDocumentId(existingRequest) as Types.ObjectId,
            );
        }

        await this.blockRepo.getActiveBlockFlags(friendId, meOid);

        const reqDoc = await this.friendshipRepo.createRequest(meOid, friendId);

        const requestPayload = {
            id: getDocumentIdString(reqDoc),
            from: meUser.username,
            fromId: meId,
            createdAt:
                reqDoc.createdAt instanceof Date
                    ? reqDoc.createdAt.toISOString()
                    : new Date().toISOString(),
        };

        try {
            this.wsServer.broadcastToUser(friendIdStr, {
                type: 'incoming_request_added',
                payload: {
                    ...requestPayload,
                    from: requestPayload.from ?? '',
                },
            });

            await notifyUser(friendIdStr, 'friend_request', {
                type: 'friend_request',
                senderName: meUser.username ?? '',
                senderId: meId,
            }).catch((err) =>
                this.logger.error('Failed to send push notification:', err),
            );
        } catch (err) {
            this.logger.error(
                'Failed to emit incoming_request_added event:',
                err,
            );
        }

        return {
            message: 'friend request sent',
            request: {
                id: getDocumentIdString(reqDoc),
                from: reqDoc.fromId.toString(),
                to: reqDoc.toId.toString(),
                status: reqDoc.status,
                createdAt: reqDoc.createdAt || new Date(),
            },
        };
    }

    @Post(':id/accept')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Accept a friend request' })
    @ApiResponse({ status: 201, type: AcceptFriendRequestResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Request not found' })
    public async acceptFriendRequest(
        @Param('id') id: string,
        @Req() req: Request,
    ): Promise<AcceptFriendRequestResponseDTO> {
        const meId = (req as unknown as RequestWithUser).user.id;
        const meOid = new Types.ObjectId(meId);
        const meUser = await this.userRepo.findById(meOid);
        if (meUser === null) {
            throw new ApiError(401, ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const requestOid = new Types.ObjectId(id);
        const fr = await this.friendshipRepo.findRequestById(requestOid);
        if (fr === null) {
            throw new ApiError(404, ErrorMessages.FRIENDSHIP.REQUEST_NOT_FOUND);
        }

        if (fr.toId.toString() !== meId) {
            throw new ApiError(403, ErrorMessages.FRIENDSHIP.NOT_ALLOWED);
        }

        if (fr.status !== 'pending') {
            throw new ApiError(
                400,
                ErrorMessages.FRIENDSHIP.REQUEST_NOT_PENDING,
            );
        }

        const fromId = fr.fromId;
        const toId = fr.toId;

        const [fromUser, toUser] = await Promise.all([
            this.userRepo.findById(fromId),
            this.userRepo.findById(toId),
        ]);

        if (fromUser === null || toUser === null) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        await this.friendshipRepo.create(fromId, toId);
        await this.friendshipRepo.create(toId, fromId);

        const fromFriendPayload = this.mapUserToFriendPayload(fromUser);
        const toFriendPayload = this.mapUserToFriendPayload(toUser);

        try {
            if (fromFriendPayload !== null && toFriendPayload !== null) {
                const fromIdStr = fromId.toString();
                const toIdStr = toId.toString();
                this.wsServer.broadcastToUser(fromIdStr, {
                    type: 'friend_added',
                    payload: { friend: toFriendPayload },
                });

                this.wsServer.broadcastToUser(toIdStr, {
                    type: 'friend_added',
                    payload: { friend: fromFriendPayload },
                });
                this.wsServer.broadcastToUser(toIdStr, {
                    type: 'incoming_request_removed',
                    payload: {
                        from: fromUser.username ?? '',
                        fromId: fromFriendPayload.id,
                    },
                });
            }
        } catch (err) {
            this.logger.error('Failed to emit friend_added events:', err);
        }

        await this.friendshipRepo.acceptRequest(requestOid);

        return {
            message: 'friend request accepted',
            friend: fromFriendPayload,
        };
    }

    @Post(':id/reject')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Reject a friend request' })
    @ApiResponse({ status: 201, type: FriendshipMessageResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Request not found' })
    public async rejectFriendRequest(
        @Param('id') id: string,
        @Req() req: Request,
    ): Promise<FriendshipMessageResponseDTO> {
        const meId = (req as unknown as RequestWithUser).user.id;
        const requestOid = new Types.ObjectId(id);
        const fr = await this.friendshipRepo.findRequestById(requestOid);

        if (fr === null) {
            throw new ApiError(404, ErrorMessages.FRIENDSHIP.REQUEST_NOT_FOUND);
        }

        if (fr.toId.toString() !== meId) {
            throw new ApiError(403, ErrorMessages.FRIENDSHIP.NOT_ALLOWED);
        }

        if (fr.status !== 'pending') {
            throw new ApiError(
                400,
                ErrorMessages.FRIENDSHIP.REQUEST_NOT_PENDING,
            );
        }

        const success = await this.friendshipRepo.rejectRequest(requestOid);
        if (!success) {
            throw new ApiError(404, ErrorMessages.FRIENDSHIP.REQUEST_NOT_FOUND);
        }

        return { message: 'friend request rejected' };
    }

    @Post(':id/cancel')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Cancel a friend request' })
    @ApiResponse({ status: 201, type: FriendshipMessageResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Request not found' })
    public async cancelFriendRequest(
        @Param('id') id: string,
        @Req() req: Request,
    ): Promise<FriendshipMessageResponseDTO> {
        const meId = (req as unknown as RequestWithUser).user.id;
        const requestOid = new Types.ObjectId(id);
        const fr = await this.friendshipRepo.findRequestById(requestOid);

        if (fr === null) {
            throw new ApiError(404, ErrorMessages.FRIENDSHIP.REQUEST_NOT_FOUND);
        }

        if (fr.fromId.toString() !== meId) {
            throw new ApiError(403, ErrorMessages.FRIENDSHIP.NOT_ALLOWED);
        }

        if (fr.status !== 'pending') {
            throw new ApiError(
                400,
                ErrorMessages.FRIENDSHIP.REQUEST_NOT_PENDING,
            );
        }

        const success = await this.friendshipRepo.rejectRequest(requestOid);
        if (!success) {
            throw new ApiError(404, ErrorMessages.FRIENDSHIP.REQUEST_NOT_FOUND);
        }

        return { message: 'friend request cancelled' };
    }

    @Post(':friendId/pin')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Toggle DM pin for a friend' })
    @ApiResponse({ status: 404, description: 'User Not Found' })
    public async togglePinFriend(
        @Param('friendId') friendId: string,
        @Req() req: Request,
    ): Promise<{ friendId: string; isPinned: boolean }> {
        const meId = (req as unknown as RequestWithUser).user.id;
        const meOid = new Types.ObjectId(meId);
        const friendOid = new Types.ObjectId(friendId);

        if (!(await this.friendshipRepo.areFriends(meOid, friendOid))) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const friendships = await this.friendshipRepo.findByUserId(meOid);
        const myRow = friendships.find(
            (f) =>
                f.userId.toString() === meId &&
                f.friendId.toString() === friendId,
        );
        const nextPinned = !(myRow?.isPinned ?? false);
        await this.friendshipRepo.setPinned(meOid, friendOid, nextPinned);

        try {
            this.wsServer.broadcastToUser(meId, {
                type: 'friend_pin_updated',
                payload: { friendId, isPinned: nextPinned },
            });
        } catch (err) {
            this.logger.error('Failed to emit friend_pin_updated event:', err);
        }

        return { friendId, isPinned: nextPinned };
    }

    @Delete(':friendId')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Remove a friend' })
    @ApiResponse({ status: 200, type: FriendshipMessageResponseDTO })
    @ApiResponse({ status: 404, description: 'User Not Found' })
    public async removeFriend(
        @Param('friendId') friendId: string,
        @Req() req: Request,
    ): Promise<FriendshipMessageResponseDTO> {
        const meId = (req as unknown as RequestWithUser).user.id;
        const meOid = new Types.ObjectId(meId);
        const friendOid = new Types.ObjectId(friendId);

        const [friend, meUser] = await Promise.all([
            this.userRepo.findById(friendOid),
            this.userRepo.findById(meOid),
        ]);

        if (friend === null) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }
        if (!meUser) {
            throw new ApiError(401, ErrorMessages.AUTH.UNAUTHORIZED);
        }

        await this.friendshipRepo.remove(meOid, friendOid);

        try {
            await this.pingService.clearPingsBetweenUsers(meOid, friendOid);
        } catch (err) {
            this.logger.error('Failed to clear pings after unfriend:', err);
        }

        try {
            await Promise.all([
                this.dmUnreadRepo.delete(meOid, friendOid),
                this.dmUnreadRepo.delete(friendOid, meOid),
            ]);
        } catch (err) {
            this.logger.error(
                'Failed to clear unread counts after unfriend:',
                err,
            );
        }

        try {
            this.wsServer.broadcastToUser(meId, {
                type: 'friend_removed',
                payload: {
                    username: friend.username ?? '',
                    userId: friendId,
                },
            });

            this.wsServer.broadcastToUser(friendId, {
                type: 'friend_removed',
                payload: {
                    username: meUser.username ?? '',
                    userId: meId,
                },
            });
        } catch (err) {
            this.logger.error('Failed to emit friend_removed event:', err);
        }

        return { message: 'Friend removed successfully' };
    }
}
