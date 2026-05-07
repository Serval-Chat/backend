import { injectable, inject, postConstruct } from 'inversify';
import mongoose from 'mongoose';
import { WsController, Event, NeedAuth, Validate } from '@/ws/decorators';
import type { WebSocket } from 'ws';
import { SetStatusSchema } from '@/validation/schemas/ws/messages.schema';
import type {
    ISetStatusEvent,
    IStatusUpdatedEvent,
    IPresenceSyncEvent,
    IUserOnlineEvent,
    IUserOfflineEvent,
} from '@/ws/protocol/events/presence';
import type { AnyResponseWsEvent } from '@/ws/protocol/envelope';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import type { IWsUser } from '@/ws/types';
import type { IBlockRepository } from '@/di/interfaces/IBlockRepository';
import { BlockFlags } from '@/privacy/blockFlags';
import logger from '@/utils/logger';

/**
 * Controller for handling presence and status events.
 * Manages online/offline status and custom status messages.
 */
@injectable()
@WsController()
export class PresenceController {
    @inject(TYPES.WsServer) private wsServer!: IWsServer;

    public constructor(
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.BlockRepository)
        private blockRepo: IBlockRepository,
    ) {}

    @postConstruct()
    public setupEventListeners() {
        this.wsServer.on('user:authenticated', (user: IWsUser) => {
            this.sendPresenceSync(user).catch((err) =>
                logger.error(
                    `[PresenceController] Failed to send presence sync: ${err}`,
                ),
            );
        });

        this.wsServer.on('user:online', (userId: string, username: string) => {
            this.broadcastUserOnline(userId, username).catch((err) =>
                logger.error(
                    `[PresenceController] Failed to broadcast user online: ${err}`,
                ),
            );
        });

        this.wsServer.on('user:offline', (userId: string, username: string) => {
            this.broadcastUserOffline(userId, username).catch((err) =>
                logger.error(
                    `[PresenceController] Failed to broadcast user offline: ${err}`,
                ),
            );
        });
    }

    /**
     * Handles 'set_status' event.
     * Sets or clears the user's custom status text.
     */
    @Event('set_status')
    @NeedAuth()
    @Validate(SetStatusSchema)
    public async onSetStatus(
        payload: ISetStatusEvent['payload'],
        authenticatedUser?: IWsUser,
        ws?: WebSocket,
    ): Promise<{ success: boolean }> {
        if (authenticatedUser === undefined) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const { status: statusText } = payload;
        const userId = authenticatedUser.userId;

        const newStatus = {
            text: statusText,
            expiresAt: null,
            updatedAt: new Date(),
        };

        await this.userRepo.updateCustomStatus(
            new mongoose.Types.ObjectId(userId),
            newStatus.text !== '' ? newStatus : null,
        );

        logger.debug(
            `[PresenceController] User ${userId} set status text: ${statusText}`,
        );

        // broadcast status update to friends and server members.
        const broadcastPayload: IStatusUpdatedEvent['payload'] = {
            userId,
            username: authenticatedUser.username,
            status:
                newStatus.text !== ''
                    ? {
                          ...newStatus,
                          emoji: null,
                          expiresAt: null,
                          updatedAt: newStatus.updatedAt.toISOString(),
                      }
                    : null,
        };

        await this.broadcastToPresenceAudience(
            userId,
            {
                type: 'status_updated',
                payload: broadcastPayload,
            },
            ws,
        );

        return { success: true };
    }

    /**
     * Sends initial presence sync after authentication.
     * Online list includes: online friends + online members from servers the user is in.
     */
    public async sendPresenceSync(authenticatedUser: IWsUser): Promise<void> {
        const userId = authenticatedUser.userId;

        const [friendships, serverIds] = await Promise.all([
            this.friendshipRepo.findByUserId(
                new mongoose.Types.ObjectId(userId),
            ),
            this.serverMemberRepo.findServerIdsByUserId(
                new mongoose.Types.ObjectId(userId),
            ),
        ]);

        const friendIds = friendships.map((f) =>
            f.userId.toString() === userId
                ? f.friendId.toString()
                : f.userId.toString(),
        );

        const serverMemberIds =
            serverIds.length > 0
                ? await this.serverMemberRepo.findUserIdsInServerIds(serverIds)
                : [];

        const relevantUserIds = new Set<string>([
            ...friendIds,
            ...serverMemberIds.map((id: mongoose.Types.ObjectId) =>
                id.toString(),
            ),
        ]);
        relevantUserIds.delete(userId);

        // fetch blocks to filter the presence sync list.
        const [blocksByA, blocksAgainstA] = await Promise.all([
            this.blockRepo.findBlocksByBlocker(
                new mongoose.Types.ObjectId(userId),
            ),
            this.blockRepo.findBlocksByTarget(
                new mongoose.Types.ObjectId(userId),
            ),
        ]);

        const peopleADoesntWantToSee = new Set(
            blocksByA
                .filter((b) => (b.flags & BlockFlags.HIDE_THEIR_PRESENCE) !== 0)
                .map((b) => b.targetId),
        );
        const peopleWhoHidFromA = new Set(
            blocksAgainstA
                .filter((b) => (b.flags & BlockFlags.HIDE_MY_PRESENCE) !== 0)
                .map((b) => b.blockerId),
        );

        const onlineStatusResults = await Promise.all(
            [...relevantUserIds]
                .filter(
                    (id) =>
                        !peopleADoesntWantToSee.has(id) &&
                        !peopleWhoHidFromA.has(id),
                )
                .map(async (id) => ({
                    id,
                    isOnline: await this.wsServer.isUserOnline(id),
                })),
        );
        const onlineRelevantIds = onlineStatusResults
            .filter((r) => r.isOnline)
            .map((r) => r.id);
        const onlineUsers =
            onlineRelevantIds.length > 0
                ? await this.userRepo.findByIds(
                      onlineRelevantIds.map(
                          (id) => new mongoose.Types.ObjectId(id),
                      ),
                  )
                : [];

        const online = onlineUsers.map((u) => ({
            userId: u._id.toString(),
            username: u.username ?? '',
            status: u.customStatus
                ? {
                      text: u.customStatus.text,
                      emoji: u.customStatus.emoji ?? null,
                      expiresAt: u.customStatus.expiresAt
                          ? u.customStatus.expiresAt.toISOString()
                          : null,
                      updatedAt: u.customStatus.updatedAt.toISOString(),
                  }
                : null,
        }));

        const syncPayload: IPresenceSyncEvent['payload'] = {
            online,
        };

        this.wsServer.broadcastToUser(userId, {
            type: 'presence_sync',
            payload: syncPayload,
        });

        logger.debug(
            `[PresenceController] Sent presence sync to ${userId} (${online.length} online: friends + server members)`,
        );
    }

    /**
     * Broadcasts user_online when a user's first session connects.
     */
    public async broadcastUserOnline(
        userId: string,
        username: string,
    ): Promise<void> {
        const user = await this.userRepo.findById(
            new mongoose.Types.ObjectId(userId),
        );
        const status = user?.customStatus
            ? {
                  text: user.customStatus.text,
                  emoji: user.customStatus.emoji ?? null,
                  expiresAt: user.customStatus.expiresAt
                      ? user.customStatus.expiresAt.toISOString()
                      : null,
                  updatedAt: user.customStatus.updatedAt.toISOString(),
              }
            : null;

        const onlinePayload: IUserOnlineEvent['payload'] = {
            userId,
            username,
            status,
        };

        await this.broadcastToPresenceAudience(userId, {
            type: 'user_online',
            payload: onlinePayload,
        });

        logger.debug(`[PresenceController] User ${userId} is now online`);
    }

    /**
     * Broadcasts user_offline when a user's last session disconnects.
     */
    public async broadcastUserOffline(
        userId: string,
        username: string,
    ): Promise<void> {
        const offlinePayload: IUserOfflineEvent['payload'] = {
            userId,
            username,
        };

        await this.broadcastToPresenceAudience(userId, {
            type: 'user_offline',
            payload: offlinePayload,
        });

        logger.debug(`[PresenceController] User ${userId} is now offline`);
    }

    /**
     * Helper to broadcast an event to a user's presence audience (friends + mutual server subscribers).
     */
    private async broadcastToPresenceAudience(
        userId: string,
        event: AnyResponseWsEvent,
        excludeWs?: WebSocket,
    ): Promise<void> {
        const friendships = await this.friendshipRepo.findByUserId(
            new mongoose.Types.ObjectId(userId),
        );
        const friendIds = friendships.map((f) =>
            f.userId.toString() === userId
                ? f.friendId.toString()
                : f.userId.toString(),
        );

        const onlineFriendStatusResults = await Promise.all(
            friendIds.map(async (id: string) => ({
                id,
                isOnline: await this.wsServer.isUserOnline(id),
            })),
        );
        const onlineFriendIds = onlineFriendStatusResults
            .filter((r) => r.isOnline)
            .map((r) => r.id);
        const serverIds = await this.serverMemberRepo.findServerIdsByUserId(
            new mongoose.Types.ObjectId(userId),
        );

        const [blocksByA, blocksAgainstA] = await Promise.all([
            this.blockRepo.findBlocksByBlocker(
                new mongoose.Types.ObjectId(userId),
            ),
            this.blockRepo.findBlocksByTarget(
                new mongoose.Types.ObjectId(userId),
            ),
        ]);

        const hideFromUserIds = [
            ...blocksByA
                .filter((b) => (b.flags & BlockFlags.HIDE_MY_PRESENCE) !== 0)
                .map((b) => b.targetId.toString()),
            ...blocksAgainstA
                .filter((b) => (b.flags & BlockFlags.HIDE_THEIR_PRESENCE) !== 0)
                .map((b) => b.blockerId.toString()),
        ];

        const filteredFriendIds = onlineFriendIds.filter(
            (id: string) => !hideFromUserIds.includes(id),
        );

        this.wsServer.broadcastToPresenceAudience(
            filteredFriendIds,
            serverIds.map((id: mongoose.Types.ObjectId) => id.toString()),
            event,
            excludeWs,
            hideFromUserIds,
        );
    }
}
