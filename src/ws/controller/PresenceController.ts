import { injectable, inject, postConstruct } from 'inversify';
import { WsController, Event, NeedAuth, Validate } from '@/ws/decorators';
import type { WebSocket } from 'ws';
import {
    SetStatusSchema,
    SetPresenceStatusSchema,
} from '@/validation/schemas/ws/messages.schema';
import type {
    ISetStatusEvent,
    IStatusUpdatedEvent,
    ISetPresenceStatusEvent,
    IPresenceStatusUpdatedEvent,
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
import type { IMuteRepository } from '@/di/interfaces/IMuteRepository';
import { BlockFlags } from '@/privacy/blockFlags';
import { assertWsNotMuted } from '@/utils/mute';
import type { IWarningRepository } from '@/di/interfaces/IWarningRepository';
import { assertWsNotWarned } from '@/utils/warning';
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
        @inject(TYPES.MuteRepository)
        private muteRepo: IMuteRepository,
        @inject(TYPES.WarningRepository)
        private warningRepo: IWarningRepository,
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
        await assertWsNotMuted(this.muteRepo, userId, 'change your status');
        await assertWsNotWarned(this.warningRepo, userId, 'change your status');

        const newStatus = {
            text: statusText,
            expiresAt: null,
            updatedAt: new Date(),
        };

        await this.userRepo.updateCustomStatus(
            userId,
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

        const user = await this.userRepo.findById(userId);

        if (user?.privacySettings?.hideStatus === true) {
            await this.broadcastToPresenceAudience(
                userId,
                { type: 'status_updated', payload: broadcastPayload },
                ws,
                {
                    type: 'status_updated',
                    payload: { ...broadcastPayload, status: null },
                },
            );
        } else {
            await this.broadcastToPresenceAudience(
                userId,
                {
                    type: 'status_updated',
                    payload: broadcastPayload,
                },
                ws,
            );
        }

        return { success: true };
    }

    /**
     * Handles 'set_presence_status' event.
     * Sets the user's manual presence status.
     */
    @Event('set_presence_status')
    @NeedAuth()
    @Validate(SetPresenceStatusSchema)
    public async onSetPresenceStatus(
        payload: ISetPresenceStatusEvent['payload'],
        authenticatedUser?: IWsUser,
        ws?: WebSocket,
    ): Promise<{ success: boolean }> {
        if (authenticatedUser === undefined) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const userId = authenticatedUser.userId;
        const previousUser = await this.userRepo.findById(userId);
        const wasOffline = previousUser?.presenceStatus === 'offline';
        const isNowOffline = payload.status === 'offline';

        await this.userRepo.updatePresenceStatus(userId, payload.status);

        logger.debug(
            `[PresenceController] User ${userId} set presence status: ${payload.status}`,
        );

        if (!wasOffline && isNowOffline) {
            const offlinePayload: IUserOfflineEvent['payload'] = {
                userId,
                username: authenticatedUser.username,
            };
            await this.broadcastToPresenceAudience(
                userId,
                { type: 'user_offline', payload: offlinePayload },
                ws,
            );
        } else if (wasOffline && !isNowOffline) {
            const status = previousUser?.customStatus
                ? {
                      text: previousUser.customStatus.text,
                      emoji: previousUser.customStatus.emoji ?? null,
                      expiresAt: previousUser.customStatus.expiresAt
                          ? previousUser.customStatus.expiresAt.toISOString()
                          : null,
                      updatedAt:
                          previousUser.customStatus.updatedAt.toISOString(),
                  }
                : null;

            const onlinePayload: IUserOnlineEvent['payload'] = {
                userId,
                username: authenticatedUser.username,
                status,
                presenceStatus: payload.status,
            };

            if (previousUser?.privacySettings?.hideStatus === true) {
                await this.broadcastToPresenceAudience(
                    userId,
                    { type: 'user_online', payload: onlinePayload },
                    ws,
                    {
                        type: 'user_online',
                        payload: { ...onlinePayload, status: null },
                    },
                );
            } else {
                await this.broadcastToPresenceAudience(
                    userId,
                    { type: 'user_online', payload: onlinePayload },
                    ws,
                );
            }
        } else if (!isNowOffline) {
            const broadcastPayload: IPresenceStatusUpdatedEvent['payload'] = {
                userId,
                username: authenticatedUser.username,
                presenceStatus: payload.status,
            };

            await this.broadcastToPresenceAudience(
                userId,
                {
                    type: 'presence_status_updated',
                    payload: broadcastPayload,
                },
                ws,
            );
        }

        return { success: true };
    }

    /**
     * Sends initial presence sync after authentication.
     * Online list includes: online friends + online members from servers the user is in.
     */
    public async sendPresenceSync(authenticatedUser: IWsUser): Promise<void> {
        const userId = authenticatedUser.userId;

        const [friendships, serverIds] = await Promise.all([
            this.friendshipRepo.findByUserId(userId),
            this.serverMemberRepo.findServerIdsByUserId(userId),
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
            ...serverMemberIds,
        ]);
        relevantUserIds.delete(userId);

        // fetch blocks to filter the presence sync list.
        const [blocksByA, blocksAgainstA] = await Promise.all([
            this.blockRepo.findBlocksByBlocker(userId),
            this.blockRepo.findBlocksByTarget(userId),
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
                ? await this.userRepo.findByIds(onlineRelevantIds)
                : [];

        const friendIdSet = new Set(friendIds);

        const online = onlineUsers
            .filter((u) => u.presenceStatus !== 'offline')
            .map((u) => {
                const hideStatusFromViewer =
                    u.privacySettings?.hideStatus === true &&
                    !friendIdSet.has(u.snowflakeId);

                return {
                    userId: u.snowflakeId,
                    username: u.username ?? '',
                    status:
                        u.customStatus && !hideStatusFromViewer
                            ? {
                                  text: u.customStatus.text,
                                  emoji: u.customStatus.emoji ?? null,
                                  expiresAt: u.customStatus.expiresAt
                                      ? u.customStatus.expiresAt.toISOString()
                                      : null,
                                  updatedAt:
                                      u.customStatus.updatedAt.toISOString(),
                              }
                            : null,
                    presenceStatus: u.presenceStatus ?? 'online',
                };
            });

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
        const user = await this.userRepo.findById(userId);

        if (user?.presenceStatus === 'offline') {
            return;
        }

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
            presenceStatus: user?.presenceStatus ?? 'online',
        };

        if (user?.privacySettings?.hideStatus === true) {
            await this.broadcastToPresenceAudience(
                userId,
                { type: 'user_online', payload: onlinePayload },
                undefined,
                {
                    type: 'user_online',
                    payload: { ...onlinePayload, status: null },
                },
            );
        } else {
            await this.broadcastToPresenceAudience(userId, {
                type: 'user_online',
                payload: onlinePayload,
            });
        }

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
     * if serverEvent is given, friends get event and servers get serverEvent instead
     */
    private async broadcastToPresenceAudience(
        userId: string,
        event: AnyResponseWsEvent,
        excludeWs?: WebSocket,
        serverEvent?: AnyResponseWsEvent,
    ): Promise<void> {
        const friendships = await this.friendshipRepo.findByUserId(userId);
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
        const serverIds =
            await this.serverMemberRepo.findServerIdsByUserId(userId);

        const [blocksByA, blocksAgainstA] = await Promise.all([
            this.blockRepo.findBlocksByBlocker(userId),
            this.blockRepo.findBlocksByTarget(userId),
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

        if (serverEvent !== undefined) {
            this.wsServer.broadcastToPresenceAudience(
                filteredFriendIds,
                [],
                event,
                excludeWs,
                hideFromUserIds,
            );
            this.wsServer.broadcastToPresenceAudience(
                [],
                serverIds,
                serverEvent,
                excludeWs,
                hideFromUserIds,
            );
            return;
        }

        this.wsServer.broadcastToPresenceAudience(
            filteredFriendIds,
            serverIds,
            event,
            excludeWs,
            hideFromUserIds,
        );
    }
}
