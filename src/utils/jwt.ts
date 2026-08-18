import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/config/env';

// JWT payload structure for user authentication
export interface JWTPayload {
    type?: 'access' | '2fa_temp';
    scope?: 'auth:2fa:verify';
    id: string;
    login: string;
    username: string;
    profilePicture?: string;
    isBot?: boolean;
    sessionId?: string;
}

export const generateTwoFactorTempToken = (payload: {
    id: string;
    login: string;
    username: string;
}) =>
    jwt.sign(
        {
            ...payload,
            type: '2fa_temp',
            scope: 'auth:2fa:verify',
        },
        JWT_SECRET,
        { expiresIn: '5m' },
    );
