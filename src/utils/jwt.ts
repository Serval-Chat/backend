import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/config/env';
import type { AdminPermissions } from '@/routes/api/v1/admin/permissions';

/**
 * JWT payload structure for user authentication.
 */
export interface JWTPayload {
    id: string;
    login: string;
    username: string;
    profilePicture?: string;
    tokenVersion: number; // For token invalidation (like when u change password or login tokenVersion changes).
    permissions?: AdminPermissions;
}

/**
 * Type-safe helper to check if user has a specific permission.
 */
export function hasPermission(
    user: JWTPayload | undefined,
    permission: keyof AdminPermissions,
): boolean {
    if (!user?.permissions) return false;
    return user.permissions[permission] === true;
}

/**
 * Generate a JWT for authenticated users.
 * Token expires after 7 days.
 * Todo: make it configurable (the expiration)
 */
export const generateJWT = (payload: JWTPayload) =>
    jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
