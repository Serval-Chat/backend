import type { WebSocket } from 'ws';

/**
 * Represents an authenticated WebSocket user.
 */
export interface IWsUser {
    /**
     * Unique identifier for the user.
     */
    userId: string;

    /**
     * User's display name or login.
     */
    username: string;

    /**
     * The WebSocket connection instance.
     */
    socket: WebSocket;

    /**
     * Timestamp of when the user was authenticated.
     */
    authenticatedAt: Date;
}
