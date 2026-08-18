import { injectable, inject } from 'inversify';
import crypto from 'crypto';
import { WsController, Event, Validate, RateLimit } from '@/ws/decorators';
import type {
    IWsAuthenticateEvent,
    IWsAuthenticatedEvent,
} from '@/ws/protocol/events/auth';
import type { WebSocket } from 'ws';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { z } from 'zod';
import type { IWsUser } from '@/ws/types';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import { resolveBotAuthPayload } from '@/utils/botAuth';
import { resolveSession } from '@/utils/sessionAuth';
import { ApiError } from '@/utils/ApiError';

const AuthenticateSchema = z.object({
    token: z.string().min(1, 'Token is required'),
});

/**
 * Controller for handling WebSocket authentication.
 */
@injectable()
@WsController()
export class AuthController {
    @inject(TYPES.WsServer) private wsServer!: IWsServer;

    public constructor(
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
    ) {}

    /**
     * Handles the 'authenticate' event.
     *
     * On success, registers the connection and returns user profile.
     * On failure, returns an error (dispatcher will handle sending).
     */
    @Event('authenticate')
    @Validate(AuthenticateSchema)
    @RateLimit(30, 60000)
    public async onAuthenticate(
        payload: IWsAuthenticateEvent['payload'],
        _authenticatedUser: undefined, // Not authenticated yet
        ws?: WebSocket,
    ): Promise<IWsAuthenticatedEvent['payload']> {
        if (!ws) {
            throw new ApiError(
                400,
                'WebSocket connection required for authentication',
            );
        }

        if (this.wsServer.getAuthenticatedUser(ws) !== undefined) {
            throw new ApiError(401, 'Already authenticated');
        }

        const { token } = payload;

        const resolved = await resolveSession(token);

        let userId: string;
        let sessionId: string | undefined;
        let isBot = false;

        if (resolved !== null) {
            userId = resolved.userId;
            sessionId = resolved.sessionId;
        } else {
            const tokenHash = crypto
                .createHash('sha256')
                .update(token)
                .digest('hex');
            const botPayload = await resolveBotAuthPayload(tokenHash);

            if (botPayload === null)
                throw new ApiError(401, 'Invalid or expired token');

            userId = botPayload.id;
            isBot = true;
        }

        const user = await this.userRepo.findById(userId);

        if (!user) {
            throw new ApiError(401, 'Account deleted or not found');
        }

        if (user.deletedAt) {
            throw new ApiError(401, 'Account deleted or not found');
        }

        if (await this.userRepo.isBanned(userId)) {
            throw new ApiError(401, 'Account banned');
        }

        isBot = isBot || user.isBot === true;

        const wsUser: IWsUser = {
            userId,
            username: user.username ?? '',
            isBot,
            socket: ws,
            authenticatedAt: new Date(),
            ...(sessionId !== undefined && {
                sessionId,
                sessionTokenHash: crypto
                    .createHash('sha256')
                    .update(token)
                    .digest('hex'),
            }),
        };

        await this.wsServer.authenticateConnection(ws, wsUser);

        if (wsUser.isBot === true) {
            const memberships =
                await this.serverMemberRepo.findByUserId(userId);
            for (const membership of memberships) {
                this.wsServer.subscribeToServer(
                    ws,
                    membership.serverId.toString(),
                );
            }
        }

        return {
            user: {
                id: user.snowflakeId,
                username: user.username ?? '',
                displayName: user.displayName ?? null,
                profilePicture: user.profilePicture ?? null,
                status: user.status ?? undefined,
            },
            instanceId: this.wsServer.instanceId,
        };
    }
}
