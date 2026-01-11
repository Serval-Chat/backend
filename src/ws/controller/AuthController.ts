import { injectable, inject } from 'inversify';
import { WsController, Event, Validate } from '@/ws/decorators';
import type {
    IWsAuthenticateEvent,
    IWsAuthenticatedEvent,
} from '@/ws/protocol/events/auth';
import type { WebSocket } from 'ws';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/config/env';
import type { JWTPayload } from '@/utils/jwt';
import { z } from 'zod';
import type { IWsUser } from '@/ws/types';
import type { IWsServer } from '@/ws/interfaces/IWsServer';

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

    constructor(
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
    ) {}

    /**
     * Handles the 'authenticate' event.
     *
     * On success, registers the connection and returns user profile.
     * On failure, returns an error (dispatcher will handle sending).
     */
    @Event('authenticate')
    @Validate(AuthenticateSchema)
    public async onAuthenticate(
        payload: IWsAuthenticateEvent['payload'],
        _authenticatedUser: undefined, // Not authenticated yet
        ws?: WebSocket,
    ): Promise<IWsAuthenticatedEvent['payload']> {
        if (!ws) {
            throw new Error('WebSocket connection required for authentication');
        }

        const { token } = payload;

        // Verify JWT
        let decoded: JWTPayload;
        try {
            decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
        } catch {
            throw new Error('AUTHENTICATION_FAILED: Invalid or expired token');
        }

        // Validate user exists and is not deleted
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

        // Validate token version
        const currentTokenVersion = user.tokenVersion || 0;
        const payloadTokenVersion = decoded.tokenVersion || 0;

        if (currentTokenVersion !== payloadTokenVersion) {
            throw new Error('AUTHENTICATION_FAILED: Token expired');
        }

        // Check for active ban
        if (await this.userRepo.isBanned(decoded.id)) {
            throw new Error('AUTHENTICATION_FAILED: Account banned');
        }

        // Authentication successful
        const wsUser: IWsUser = {
            userId: decoded.id,
            username: decoded.username,
            socket: ws,
            authenticatedAt: new Date(),
        };

        this.wsServer.authenticateConnection(ws, wsUser);

        // Return user profile
        return {
            user: {
                id: user._id.toString(),
                username: user.username || '',
                displayName: user.displayName ?? null,
                profilePicture: user.profilePicture ?? null,
                status: user.status || undefined,
            },
        };
    }
}
