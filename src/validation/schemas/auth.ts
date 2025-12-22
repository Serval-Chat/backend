import { z } from 'zod';
import {
    loginSchema,
    usernameSchema,
    passwordSchema,
    inviteTokenSchema,
} from './common';

/**
 * Registration request validation
 */
export const registerSchema = z.object({
    login: loginSchema,
    username: usernameSchema,
    password: passwordSchema,
    invite: inviteTokenSchema,
});

/**
 * Login request validation
 */
export const loginRequestSchema = z.object({
    login: loginSchema,
    password: z.string().min(1, 'Password is required'),
});

export type RegisterRequest = z.infer<typeof registerSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
