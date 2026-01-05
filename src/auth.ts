import type * as express from 'express';
import * as jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/config/env';
import { User } from '@/models/User';
import { Ban } from '@/models/Ban';
import { Types } from 'mongoose';
import type { JWTPayload } from '@/utils/jwt';

// Handles authentication and authorization for routes
// Enforces boundaries including JWT verification, bans, deletion, and permission scopes
// Rejects on authentication failure or if the user lacks required scopes
//
// @returns Decoded JWT payload
// @throws {Error | {status: number, message: string}} Rejects with mixed error shapes
export async function expressAuthentication(
    request: express.Request,
    securityName: string,
    scopes?: string[],
): Promise<JWTPayload> {
    if (securityName === 'jwt') {
        const authHeader = request.headers['authorization'];
        const token =
            typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
                ? authHeader.slice('Bearer '.length).trim()
                : undefined;

        if (!token) {
            return Promise.reject(new Error('No token provided'));
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

            const user = await User.findById(decoded.id)
                .select('deletedAt tokenVersion username permissions')
                .lean();

            if (!user) {
                return Promise.reject(new Error('Invalid token'));
            }

            if (user.deletedAt) {
                return Promise.reject(new Error('Invalid token'));
            }

            const currentTokenVersion = user.tokenVersion || 0;
            const payloadTokenVersion = decoded.tokenVersion || 0;

            if (currentTokenVersion !== payloadTokenVersion) {
                return Promise.reject(new Error('Token expired'));
            }

            let userObjectId: Types.ObjectId;
            try {
                userObjectId = new Types.ObjectId(decoded.id);
            } catch {
                return Promise.reject(new Error('Invalid token payload'));
            }

            // Side effect: Automatically clears expired bans before checking for active ones
            await Ban.checkExpired(userObjectId);
            const activeBan = await Ban.findOne({
                userId: userObjectId,
                active: true,
            });
            if (activeBan) {
                return Promise.reject({
                    status: 403,
                    message: 'Account banned',
                    ban: {
                        reason: activeBan.reason,
                        expirationTimestamp: activeBan.expirationTimestamp,
                    },
                });
            }

            if (scopes && scopes.length > 0) {
                const userPermissions = user.permissions;
                if (!userPermissions) {
                    return Promise.reject({
                        status: 403,
                        message: 'Insufficient permissions',
                    });
                }

                const hasAllScopes = scopes.every(
                    (scope) =>
                        (userPermissions as Record<string, boolean>)[scope] ===
                        true,
                );
                if (!hasAllScopes) {
                    return Promise.reject({
                        status: 403,
                        message: 'Insufficient permissions',
                    });
                }
            }

            return Promise.resolve(decoded);
        } catch (err) {
            if (err && typeof err === 'object' && 'status' in err) {
                return Promise.reject(err);
            }
            return Promise.reject(new Error('Invalid token'));
        }
    }

    return Promise.reject(new Error('Authentication failed'));
}
