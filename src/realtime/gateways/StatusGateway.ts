import { injectable, inject } from 'inversify';
import { Gateway, On } from '../core/decorators';
import { SocketContext } from '../core/types';
import {
    StatusSubscribeSchema,
    StatusUnsubscribeSchema,
    StatusRequestSchema,
} from '../../validation/schemas/realtime/status.schema';
import { StatusService } from '../services/StatusService';
import { TYPES } from '../../di/types';
import { IUserRepository } from '../../di/interfaces/IUserRepository';
import { resolveSerializedCustomStatus } from '../../utils/status';
import { z } from 'zod';
import logger from '../../utils/logger';

/**
 * Status Gateway.
 *
 * Manages user custom status updates and subscriptions.
 * Allows clients to subscribe to status changes of other users.
 */
@injectable()
@Gateway()
export class StatusGateway {
    constructor(
        @inject(TYPES.StatusService) private statusService: StatusService,
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
    ) {}

    /**
     * Handles 'status_subscribe' event.
     *
     * Subscribes the socket to status updates for a list of users.
     * Limits subscriptions to 200 users per request.
     */
    @On('status_subscribe', StatusSubscribeSchema)
    async onSubscribe(
        ctx: SocketContext,
        payload: z.infer<typeof StatusSubscribeSchema>,
    ) {
        const { usernames } = payload;
        const socketId = ctx.socket.id;

        usernames
            .map((name) => name.trim())
            .filter((name) => name.length > 0)
            .slice(0, 200)
            .forEach((target) =>
                this.statusService.addSubscription(target, socketId),
            );
    }

    /**
     * Handles 'status_unsubscribe' event.
     *
     * Unsubscribes the socket from status updates.
     * If no usernames provided, clears all subscriptions.
     */
    @On('status_unsubscribe', StatusUnsubscribeSchema)
    async onUnsubscribe(
        ctx: SocketContext,
        payload: z.infer<typeof StatusUnsubscribeSchema>,
    ) {
        const { usernames } = payload;
        const socketId = ctx.socket.id;

        if (!usernames) {
            this.statusService.clearSubscriptionsForSocket(socketId);
            return;
        }

        usernames
            .map((name) => name.trim())
            .filter((name) => name.length > 0)
            .forEach((target) =>
                this.statusService.removeSubscription(target, socketId),
            );
    }

    /**
     * Handles 'status_request' event.
     *
     * Fetches current status for a list of users.
     * Returns a map of username -> status.
     */
    @On('status_request', StatusRequestSchema)
    async onRequest(
        ctx: SocketContext,
        payload: z.infer<typeof StatusRequestSchema>,
    ) {
        const { usernames } = payload;

        const sanitized = usernames
            .map((name) => name.trim())
            .filter((name) => name.length > 0)
            .slice(0, 200);

        if (sanitized.length === 0) {
            return { ok: true, statuses: {} };
        }

        try {
            const users = await this.userRepo.findByUsernames(sanitized);
            const result: Record<string, any> = {};

            sanitized.forEach((name) => {
                result[name] = null;
            });

            users.forEach((user) => {
                if (user.username) {
                    result[user.username] = resolveSerializedCustomStatus(
                        user.customStatus,
                    );
                }
            });

            return { ok: true, statuses: result };
        } catch (err) {
            logger.error('status_request error:', err);
            return { ok: false, error: 'internal error' };
        }
    }

    @On('disconnect')
    async onDisconnect(ctx: SocketContext) {
        this.statusService.clearSubscriptionsForSocket(ctx.socket.id);
    }
}
