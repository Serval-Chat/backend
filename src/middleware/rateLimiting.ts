import type { Request } from 'express';
import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { RedisReply } from 'rate-limit-redis';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/config/env';
import type { JWTPayload } from '@/utils/jwt';
import { container } from '@/di/container';
import { TYPES } from '@/di/types';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import { resolveSession } from '@/utils/sessionAuth';

const ONE_MINUTE = 60_000;
const ONE_HOUR = 60 * ONE_MINUTE;

function getStore(prefix: string) {
    return new RedisStore({
        sendCommand: async (...args: string[]): Promise<RedisReply> => {
            if (args.length === 0) return '';
            const client = container
                .get<IRedisService>(TYPES.RedisService)
                .getClient();
            const command = args[0] as string;
            const cmdArgs = args.slice(1);
            return client.call(command, ...cmdArgs) as Promise<RedisReply>;
        },
        prefix,
    });
}

type LimiterOptions = Pick<
    Partial<Options>,
    'windowMs' | 'max' | 'keyGenerator' | 'message' | 'skipSuccessfulRequests'
>;

function makeLimiter(prefix: string, options: LimiterOptions) {
    return rateLimit({
        ...(process.env.NODE_ENV !== 'test' ? { store: getStore(prefix) } : {}),
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        ...options,
    });
}

function clientIp(req: Request): string {
    return ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'ip');
}

// Rate limiter for login attempts.
//
// Limits to 5 attempts per minute per IP+login combination.
export const loginLimiter = makeLimiter('rl:login:', {
    windowMs: ONE_MINUTE,
    max: 5,
    keyGenerator: (req: Request) => {
        const login =
            typeof req.body?.login === 'string'
                ? req.body.login.toLowerCase()
                : '';
        const ip = clientIp(req);
        return `${ip}:${login}`;
    },
    message: 'Too many login attempts, please wait and try again.',
});

// Rate limiter for registration attempts.
//
// Limits to 3 attempts per minute per IP.
export const registrationLimiter = makeLimiter('rl:reg:', {
    windowMs: ONE_MINUTE,
    max: 3,
    keyGenerator: clientIp,
    message: 'Too many registration attempts, please wait and try again.',
});

// Rate limiter for sensitive authenticated operations.
export const sensitiveOperationLimiter = makeLimiter('rl:sens:', {
    windowMs: ONE_HOUR,
    max: 3,
    keyGenerator: authenticatedUserKey,
    message: 'Too many password change attempts, please try again later.',
    skipSuccessfulRequests: true, // Don't count successful operations
});

// Rate limiter for TOTP verification.
export const twoFactorVerifyLimiter = makeLimiter('rl:2fa-verify:', {
    windowMs: 15 * ONE_MINUTE,
    max: 10,
    keyGenerator: twoFactorSubjectKey,
    message: 'Too many verification attempts, please try again later.',
    skipSuccessfulRequests: true,
});

// Rate limiter for password reset email requests.
//
// Limits to 5 attempts per hour per IP+email combination.
export const passwordResetLimiter = makeLimiter('rl:password-reset:', {
    windowMs: ONE_HOUR,
    max: 5,
    keyGenerator: (req: Request) => {
        const email =
            typeof req.body?.email === 'string'
                ? req.body.email.toLowerCase()
                : '';
        const ip = clientIp(req);
        return `${ip}:${email}`;
    },
    message: 'Too many password reset attempts, please try again later.',
});

// Rate limiter for bot token creation and rotation.
//
// Limits to 10 attempts per minute per IP+clientId combination.
export const botTokenLimiter = makeLimiter('rl:bot-token:', {
    windowMs: ONE_MINUTE,
    max: 10,
    keyGenerator: (req: Request) => {
        const clientId =
            typeof req.params.clientId === 'string' ? req.params.clientId : '';
        const ip = clientIp(req);
        return `${ip}:${clientId}`;
    },
    message: 'Too many bot token attempts, please try again later.',
});

// Rate limiter for public webhook execution.
//
// Limits each webhook token to 60 deliveries per minute, with an IP fallback.
export const webhookExecutionLimiter = makeLimiter('rl:webhook:', {
    windowMs: ONE_MINUTE,
    max: 60,
    keyGenerator: (req: Request) => {
        const token =
            typeof req.params.token === 'string' ? req.params.token : '';
        return token !== '' ? token : clientIp(req);
    },
    message: 'Too many webhook requests, please try again later.',
});

export const messageSearchLimiter = makeLimiter('rl:message-search:', {
    windowMs: ONE_MINUTE,
    max: 30,
    keyGenerator: authenticatedUserKey,
    message: 'Too many search requests, please try again later.',
});

export const reportSubmitLimiter = makeLimiter('rl:report-submit:', {
    windowMs: ONE_HOUR,
    max: 5,
    keyGenerator: authenticatedUserKey,
    message: 'Too many reports submitted, please try again later.',
});

export const discoverySearchLimiter = makeLimiter('rl:discovery:search:', {
    windowMs: ONE_MINUTE,
    max: 60,
    keyGenerator: authenticatedUserKey,
    message: 'Too many discovery searches, please try again later.',
});

export const discoverySettingsLimiter = makeLimiter('rl:discovery:settings:', {
    windowMs: ONE_MINUTE,
    max: 20,
    keyGenerator: async (req: Request) => {
        const serverId =
            typeof req.params.serverId === 'string' ? req.params.serverId : '';
        return `${await authenticatedUserKey(req)}:${serverId}`;
    },
    message: 'Too many discovery setting updates, please try again later.',
});

// Rate limiter for password reset confirmations.
export const passwordResetConfirmLimiter = makeLimiter(
    'rl:password-reset-confirm:',
    {
        windowMs: ONE_HOUR,
        max: 10,
        keyGenerator: clientIp,
        message: 'Too many password reset attempts, please try again later.',
    },
);

/**
 * Bucket key for TOTP verification: the account named by the temp token.
 *
 * Falls back to the IP when the token is missing, malformed or not a temp
 * token, so a client cannot escape the limit by omitting it.
 */
function twoFactorSubjectKey(req: Request): string {
    const tempToken = req.body?.tempToken;
    if (typeof tempToken === 'string' && tempToken !== '') {
        try {
            const payload = jwt.verify(tempToken, JWT_SECRET, {
                algorithms: ['HS256'],
            }) as JWTPayload;
            if (
                payload.type === '2fa_temp' &&
                payload.scope === 'auth:2fa:verify' &&
                typeof payload.id === 'string'
            ) {
                return `2fa:${payload.id}`;
            }
        } catch {
            // Fall through to the IP.
        }
    }

    return clientIp(req);
}

async function authenticatedUserKey(req: Request): Promise<string> {
    const guardedUserId = (req as Request & { user?: JWTPayload }).user?.id;
    if (guardedUserId !== undefined) return guardedUserId;

    const header = req.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
        const resolved = await resolveSession(header.slice('Bearer '.length));
        if (resolved !== null) return resolved.userId;
    }

    return clientIp(req);
}

export const gifTagCreateLimiter = makeLimiter('rl:gif-tag:create:', {
    windowMs: ONE_MINUTE,
    max: 20,
    keyGenerator: authenticatedUserKey,
    message: 'Too many tags created, please try again later.',
});

export const gifTagBulkLimiter = makeLimiter('rl:gif-tag:bulk:', {
    windowMs: ONE_MINUTE,
    max: 60,
    keyGenerator: authenticatedUserKey,
    message: 'Too many tag updates, please try again later.',
});

export const gifTagSearchLimiter = makeLimiter('rl:gif-tag:search:', {
    windowMs: ONE_MINUTE,
    max: 30,
    keyGenerator: authenticatedUserKey,
    message: 'Too many tag searches, please try again later.',
});

export const websiteConnectionCreateLimiter = makeLimiter(
    'rl:website-connection:create:',
    {
        windowMs: ONE_HOUR,
        max: 5,
        keyGenerator: authenticatedUserKey,
        message:
            'Too many website connection requests, please try again later.',
    },
);

export const websiteConnectionVerifyLimiter = makeLimiter(
    'rl:website-connection:verify:',
    {
        windowMs: ONE_HOUR,
        max: 10,
        keyGenerator: authenticatedUserKey,
        message:
            'Too many website verification attempts, please try again later.',
    },
);

export const websiteConnectionRemoveLimiter = makeLimiter(
    'rl:website-connection:remove:',
    {
        windowMs: ONE_HOUR,
        max: 30,
        keyGenerator: authenticatedUserKey,
        message:
            'Too many website connection removal requests, please try again later.',
    },
);

export const API_FLOOR_WINDOW_MS = ONE_MINUTE;
export const API_FLOOR_MAX = 600;

export const apiFloorLimiter = makeLimiter('rl:api-floor:', {
    windowMs: API_FLOOR_WINDOW_MS,
    max: API_FLOOR_MAX,
    keyGenerator: authenticatedUserKey,
    message: 'Too many requests, please slow down.',
});

export const EMBED_PROXY_WINDOW_MS = ONE_MINUTE;
export const EMBED_PROXY_MAX = 200;

export const embedProxyLimiter = makeLimiter('rl:embed-proxy:', {
    windowMs: EMBED_PROXY_WINDOW_MS,
    max: EMBED_PROXY_MAX,
    keyGenerator: clientIp,
    message: 'Too many embed proxy requests, please slow down.',
});

export const CRAWLER_PREVIEW_WINDOW_MS = ONE_MINUTE;
export const CRAWLER_PREVIEW_MAX = 30;

export const crawlerPreviewLimiter = makeLimiter('rl:crawler-preview:', {
    windowMs: CRAWLER_PREVIEW_WINDOW_MS,
    max: CRAWLER_PREVIEW_MAX,
    keyGenerator: clientIp,
    message: 'Too many invite preview requests, please slow down.',
});

export const sessionManagementLimiter = makeLimiter('rl:session-mgmt:', {
    windowMs: ONE_HOUR,
    max: 30,
    keyGenerator: authenticatedUserKey,
    message: 'Too many session management requests, please try again later.',
});

export const passkeyRegisterLimiter = makeLimiter('rl:passkey-reg:', {
    windowMs: ONE_HOUR,
    max: 10,
    keyGenerator: authenticatedUserKey,
    message: 'Too many passkey registration attempts, please try again later.',
});

export const passkeyManageLimiter = makeLimiter('rl:passkey-mgmt:', {
    windowMs: ONE_HOUR,
    max: 30,
    keyGenerator: authenticatedUserKey,
    message: 'Too many passkey management requests, please try again later.',
});

export const passkeyLoginOptionsLimiter = makeLimiter('rl:passkey-login-opt:', {
    windowMs: ONE_MINUTE,
    max: 20,
    keyGenerator: clientIp,
    message: 'Too many passkey sign-in attempts, please try again later.',
});

export const passkeyLoginVerifyLimiter = makeLimiter(
    'rl:passkey-login-verify:',
    {
        windowMs: ONE_MINUTE,
        max: 10,
        keyGenerator: clientIp,
        message: 'Too many passkey sign-in attempts, please try again later.',
    },
);

export const passwordlessEnableLimiter = makeLimiter(
    'rl:passwordless-enable:',
    {
        windowMs: ONE_HOUR,
        max: 5,
        keyGenerator: authenticatedUserKey,
        message: 'Too many attempts, please try again later.',
    },
);

export const passwordlessRecoveryRegenerateLimiter = makeLimiter(
    'rl:passwordless-regen:',
    {
        windowMs: ONE_HOUR,
        max: 10,
        keyGenerator: authenticatedUserKey,
        message: 'Too many attempts, please try again later.',
    },
);

// Rate limiter for recovery-key login attempts.
export const passwordlessRecoverLimiter = makeLimiter(
    'rl:passwordless-recover:',
    {
        windowMs: ONE_MINUTE,
        max: 5,
        keyGenerator: (req: Request) => {
            const login =
                typeof req.body?.login === 'string'
                    ? req.body.login.toLowerCase()
                    : '';
            const ip = clientIp(req);
            return `${ip}:${login}`;
        },
        message: 'Too many recovery attempts, please wait and try again.',
    },
);

export const adminPasswordlessResetLimiter = makeLimiter(
    'rl:admin-passwordless-reset:',
    {
        windowMs: ONE_HOUR,
        max: 20,
        keyGenerator: authenticatedUserKey,
        message: 'Too many admin reset requests, please try again later.',
    },
);
