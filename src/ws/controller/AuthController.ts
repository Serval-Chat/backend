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
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/config/env';
import type { JWTPayload } from '@/utils/jwt';
import { z } from 'zod';
import type { IWsUser } from '@/ws/types';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import { resolveBotAuthPayload } from '@/utils/botAuth';

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
    @RateLimit(5, 10000) // 5 authentication attempts per 10s per connection
    public async onAuthenticate(
        payload: IWsAuthenticateEvent['payload'],
        _authenticatedUser: undefined, // Not authenticated yet
        ws?: WebSocket,
    ): Promise<IWsAuthenticatedEvent['payload']> {
        if (!ws) {
            throw new Error('WebSocket connection required for authentication');
        }

        const { token } = payload;

        let decoded: JWTPayload | null = null;
        try {
            const verified = jwt.verify(token, JWT_SECRET, {
                algorithms: ['HS256'],
            }) as JWTPayload;
            if (verified.type === 'access') {
                decoded = verified;
            }
        } catch {
            console.error('Failed to verify token.');
        }

        if (decoded === null) {
            const tokenHash = crypto
                .createHash('sha256')
                .update(token)
                .digest('hex');
            const botPayload = await resolveBotAuthPayload(tokenHash);

            if (botPayload === null)
                throw new Error(
                    'AUTHENTICATION_FAILED: Invalid or expired token',
                );

            decoded = botPayload;
        }

        const user = await this.userRepo.findById(decoded.id);

        if (!user) {
            throw new Error(
                'AUTHENTICATION_FAILED: Account deleted or not found',
            );
        }

        if (user.deletedAt) {
            throw new Error(
                'AUTHENTICATION_FAILED: Account deleted or not found',
            );
        }

        if (Number(user.tokenVersion ?? 0) !== Number(decoded.tokenVersion)) {
            throw new Error('AUTHENTICATION_FAILED: Token expired');
        }

        if (await this.userRepo.isBanned(decoded.id)) {
            throw new Error('AUTHENTICATION_FAILED: Account banned');
        }

        const wsUser: IWsUser = {
            userId: decoded.id,
            username: decoded.username,
            isBot: decoded.isBot ?? false,
            socket: ws,
            authenticatedAt: new Date(),
        };

        await this.wsServer.authenticateConnection(ws, wsUser);

        if (wsUser.isBot === true) {
            const memberships = await this.serverMemberRepo.findByUserId(
                decoded.id,
            );
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
