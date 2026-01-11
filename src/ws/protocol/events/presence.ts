import type { WsEvent } from '@/ws/protocol/event';

/**
 * Server → Client (Automatic on authentication)
 * Initial sync of online users (friends + current server members).
 */
export interface IPresenceSyncEvent
    extends WsEvent<
        'presence_sync',
        {
            online: Array<{
                userId: string;
                username: string;
                status?: string; // Custom status text
            }>;
        }
    > {}

/**
 * Server → Client (Broadcast)
 * A user came online.
 */
export interface IUserOnlineEvent
    extends WsEvent<
        'user_online',
        {
            userId: string;
            username: string;
            status?: string;
        }
    > {}

/**
 * Server → Client (Broadcast)
 * A user went offline.
 */
export interface IUserOfflineEvent
    extends WsEvent<
        'user_offline',
        {
            userId: string;
            username: string;
        }
    > {}

/**
 * Client → Server
 * Set custom status text.
 */
export interface ISetStatusEvent
    extends WsEvent<
        'set_status',
        {
            status: string; // Empty string to clear
        }
    > {}

/**
 * Server → Client (Broadcast)
 * User's status was updated.
 */
export interface IStatusUpdatedEvent
    extends WsEvent<
        'status_updated',
        {
            userId: string;
            username: string;
            status: string;
        }
    > {}

/**
 * Server → Client (Broadcast)
 * User's profile details updated (badges, profile picture).
 */
export interface IUserUpdatedEvent
    extends WsEvent<
        'user_updated',
        {
            userId: string;
            profilePicture?: string | null;
            badges?: string[];
            oldUsername?: string;
            newUsername?: string;
            usernameFont?: string;
            usernameGradient?: {
                enabled: boolean;
                colors: string[];
                angle: number;
            };
            usernameGlow?: {
                enabled: boolean;
                color: string;
                intensity: number;
            };
        }
    > {}

/**
 * Server → Client (Broadcast)
 * User's banner updated.
 */
export interface IUserBannerUpdatedEvent
    extends WsEvent<
        'user_banner_updated',
        {
            username: string;
            banner: string;
        }
    > {}

/**
 * Server → Client (Broadcast)
 * User's display name updated.
 */
export interface IDisplayNameUpdatedEvent
    extends WsEvent<
        'display_name_updated',
        {
            username: string;
            displayName: string | null;
        }
    > {}

/**
 * Server → Client (Broadcast)
 * Legacy status update event.
 */
export interface IStatusUpdateLegacyEvent
    extends WsEvent<
        'status_update',
        {
            username: string;
            status: unknown | null;
        }
    > {}
