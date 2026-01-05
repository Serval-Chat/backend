import { injectable, inject } from 'inversify';
import { Gateway, On } from '@/realtime/core/decorators';
import { SocketContext, OnGatewayConnection } from '@/realtime/core/types';
import { PresenceService } from '@/realtime/services/PresenceService';
import { TYPES } from '@/di/types';
import { PingService } from '@/services/PingService';
import { websocketMessagesCounter } from '@/utils/metrics';
import logger from '@/utils/logger';

/**
 * Presence Gateway.
 *
 * Manages user online/offline status and broadcasts state changes.
 */
@injectable()
@Gateway()
export class PresenceGateway implements OnGatewayConnection {
    constructor(
        @inject(TYPES.PresenceService) private presenceService: PresenceService,
        @inject(TYPES.PingService) private pingService: PingService,
    ) { }

    /**
     * Handles new socket connection.
     *
     * Marks user as online, broadcasts 'user_online' if it's their first session.
     * Sends current presence state and any stored pings to the user.
     */
    async handleConnection(ctx: SocketContext) {
        if (!ctx.user) return;
        const { username, id: userId } = ctx.user;
        const socketId = ctx.socket.id;

        const becameOnline = this.presenceService.addOnline(username, socketId);

        ctx.socket.emit('presence_state', {
            online: this.presenceService.getAllOnlineUsers(),
        });

        if (becameOnline) {
            ctx.socket.broadcast.emit('user_online', { username });
        }

        // Send stored pings to the user when they connect
        try {
            const storedPings = await this.pingService.getPingsForUser(userId);
            if (storedPings.length > 0) {
                storedPings.forEach((ping) => {
                    ctx.socket.emit('ping', ping);
                    websocketMessagesCounter.labels('ping', 'outbound').inc();
                });
            }
        } catch (err) {
            logger.error('Error sending stored pings on connection:', err);
        }
    }

    /**
     * Handles socket disconnection.
     *
     * Marks user as offline if this was their last session.
     * Broadcasts 'user_offline' event.
     */
    @On('disconnect')
    async onDisconnect(ctx: SocketContext) {
        if (!ctx.user) return;
        const { username } = ctx.user;
        const socketId = ctx.socket.id;

        const wentOffline = this.presenceService.removeOnline(
            username,
            socketId,
        );

        if (wentOffline) {
            ctx.socket.broadcast.emit('user_offline', { username });
        }
    }
}
