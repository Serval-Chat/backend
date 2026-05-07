import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/config/env';
import type { AdminPermissions } from '@/permissions/AdminPermissions';

// JWT payload structure for user authentication
export interface JWTPayload {
    type?: 'access' | '2fa_temp';
    scope?: 'auth:2fa:verify';
    id: string;
    login: string;
    username: string;
    profilePicture?: string;
    tokenVersion: number; // For token invalidation (like when you change password or login tokenVersion changes).
    permissions?: AdminPermissions;
    isBot?: boolean;
}

// Helper to check if user has a specific permission
export function hasPermission(
    user: JWTPayload | undefined,
    permission: keyof AdminPermissions,
): boolean {
    if (!user?.permissions) return false;
    return user.permissions[permission] === true;
}

// Generate a JWT for authenticated users
export const generateJWT = (payload: JWTPayload) =>
    jwt.sign({ ...payload, type: 'access' }, JWT_SECRET, { expiresIn: '7d' });

export const generateTwoFactorTempToken = (payload: {
    id: string;
    login: string;
    username: string;
    tokenVersion: number;
}) =>
    jwt.sign(
        {
            ...payload,
            type: '2fa_temp',
            scope: 'auth:2fa:verify',
        } as JWTPayload,
        JWT_SECRET,
        { expiresIn: '5m' },
    );
