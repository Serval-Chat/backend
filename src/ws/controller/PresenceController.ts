import { injectable, inject, postConstruct } from 'inversify';
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
import logger from '@/utils/logger';

/**
 * Controller for handling presence and status events.
 * Manages online/offline status and custom status messages.
 */
@injectable()
@WsController()
export class PresenceController {
    @inject(TYPES.WsServer) private wsServer!: IWsServer;

    constructor(
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
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
        if (!authenticatedUser) {
            throw new Error('UNAUTHORIZED: Authentication required');
        }

        const { status } = payload;
        const userId = authenticatedUser.userId;

        await this.userRepo.update(userId, { status: status || '' });

        logger.debug(
            `[PresenceController] User ${userId} set status: ${status}`,
        );

        // Broadcast status update to friends and server members
        const broadcastPayload: IStatusUpdatedEvent['payload'] = {
            userId,
            username: authenticatedUser.username,
            status: status || '',
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
     */
    public async sendPresenceSync(authenticatedUser: IWsUser): Promise<void> {
        const userId = authenticatedUser.userId;

        const friendships = await this.friendshipRepo.findByUserId(userId);

        const friendIds = friendships.map((f) =>
            f.userId.toString() === userId
                ? f.friendId.toString()
                : f.userId.toString(),
        );

        const onlineFriendIds = friendIds.filter((id) =>
            this.wsServer.isUserOnline(id),
        );
        const onlineFriendUsers =
            onlineFriendIds.length > 0
                ? await this.userRepo.findByIds(onlineFriendIds)
                : [];

        const onlineFriends = onlineFriendUsers.map((u) => ({
            userId: u._id.toString(),
            username: u.username || '',
            status: u.status || undefined,
        }));

        const syncPayload: IPresenceSyncEvent['payload'] = {
            online: onlineFriends,
        };

        this.wsServer.broadcastToUser(userId, {
            type: 'presence_sync',
            payload: syncPayload,
        });

        logger.debug(
            `[PresenceController] Sent presence sync to ${userId} (${onlineFriends.length} online friends)`,
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
        const status = user?.status || undefined;

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
        const friendships = await this.friendshipRepo.findByUserId(userId);
        const friendIds = friendships.map((f) =>
            f.userId.toString() === userId
                ? f.friendId.toString()
                : f.userId.toString(),
        );

        const onlineFriendIds = friendIds.filter((id) =>
            this.wsServer.isUserOnline(id),
        );
        const serverIds =
            await this.serverMemberRepo.findServerIdsByUserId(userId);

        this.wsServer.broadcastToPresenceAudience(
            onlineFriendIds,
            serverIds,
            event,
            excludeWs,
        );
    }
}
