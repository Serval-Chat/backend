import type { Socket } from 'socket.io';
import type { Container } from 'inversify';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/config/env';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import logger from '@/utils/logger';
import { Ban } from '@/models/Ban';
import { Types } from 'mongoose';

// Creates the Socket.IO authentication middleware
//
// Verifies the JWT token from the handshake auth or headers
// Checks if the user exists, is not soft-deleted, and is not banned
// Ensures the token version matches the user's current version
//
// @param container - The DI container to resolve dependencies
// @returns The middleware function
export const createAuthMiddleware = (container: Container) => {
    const userRepo = container.get<IUserRepository>(TYPES.UserRepository);

    return async (socket: Socket, next: (err?: Error) => void) => {
        try {
            const token =
                socket.handshake.auth?.token ||
                socket.handshake.headers?.authorization?.split(' ')[1];

            if (!token) {
                return next(new Error('Authentication error'));
            }

            const decoded = jwt.verify(token, JWT_SECRET) as any;

            // Validate user exists and is not deleted using repository
            const user = await userRepo.findById(decoded.id);

            if (!user) {
                return next(new Error('Account deleted or not found'));
            }

            if (user.deletedAt) {
                return next(new Error('Account deleted or not found'));
            }

            // Validate tokenVersion
            const currentTokenVersion = user.tokenVersion || 0;
            const payloadTokenVersion = decoded.tokenVersion || 0;

            if (currentTokenVersion !== payloadTokenVersion) {
                return next(new Error('Token expired'));
            }

            // Check for active ban
            const userObjectId = new Types.ObjectId(decoded.id);
            await Ban.checkExpired(userObjectId);
            const activeBan = await Ban.findOne({
                userId: userObjectId,
                active: true,
            });

            if (activeBan) {
                return next(new Error('Account banned'));
            }

            (socket as any).user = decoded;
            next();
        } catch (err: any) {
            logger.error('[Socket Failure] Authentication', {
                reason: err.message || 'Authentication failed',
                socketId: socket.id,
                stack: err.stack,
            });
            next(new Error('Authentication error'));
        }
    };
};
