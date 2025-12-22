import { injectable } from 'inversify';
import {
    onlineUsersGauge,
    websocketConnectionsGauge,
} from '../../utils/metrics';

/**
 * Presence Service.
 *
 * Manages the online/offline status of users.
 * Tracks active socket connections for each user.
 */
@injectable()
export class PresenceService {
    private onlineUsers = new Map<string, Set<string>>();

    /**
     * Adds a user to the online list.
     *
     * @param username - The username of the connected user.
     * @param socketId - The socket ID of the new connection.
     * @returns True if the user was previously offline (i.e., this is their first connection).
     */
    addOnline(username: string, socketId: string): boolean {
        const set = this.onlineUsers.get(username) || new Set<string>();
        const wasOnline = set.size > 0;
        set.add(socketId);
        this.onlineUsers.set(username, set);

        onlineUsersGauge.set(this.onlineUsers.size);
        websocketConnectionsGauge.inc();

        return !wasOnline;
    }

    /**
     * Removes a socket connection for a user.
     *
     * @param username - The username of the disconnected user.
     * @param socketId - The socket ID to remove.
     * @returns True if the user is now completely offline (i.e., no more active connections).
     */
    removeOnline(username: string, socketId: string): boolean {
        const set = this.onlineUsers.get(username);
        if (!set) return false;
        set.delete(socketId);
        if (set.size === 0) {
            this.onlineUsers.delete(username);
            onlineUsersGauge.set(this.onlineUsers.size);
            websocketConnectionsGauge.dec();
            return true;
        }
        websocketConnectionsGauge.dec();
        return false;
    }

    /**
     * Gets all active socket IDs for a user.
     *
     * @param username - The username to look up.
     * @returns An array of socket IDs.
     */
    getSockets(username: string): string[] {
        const set = this.onlineUsers.get(username);
        return set ? Array.from(set) : [];
    }

    getAllOnlineUsers(): string[] {
        return Array.from(this.onlineUsers.keys());
    }
}
