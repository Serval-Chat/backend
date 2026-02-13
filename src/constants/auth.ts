export const AUTH_CONSTANTS = {
    RATE_LIMIT: {
        WINDOW_MS: 60 * 60 * 1000, // 1 hour
        MAX_PER_IP: 5,
        MAX_PER_USER: 3,
    },
    TOKEN: {
        EXPIRY_MS: 15 * 60 * 1000, // 15 minutes
    },
    SHUTDOWN: {
        TIMEOUT_MS: 30000, // 30 seconds
    },
} as const;
