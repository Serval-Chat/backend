import { injectable } from 'inversify';

/**
 * Status Service.
 *
 * Manages subscriptions to user status updates.
 * Allows clients to subscribe to status changes of specific users.
 */
@injectable()
export class StatusService {
    private userSubscribers = new Map<string, Set<string>>();
    private socketSubscriptions = new Map<string, Set<string>>();

    /**
     * Adds a subscription for a socket to a target user's status.
     *
     * @param username - The username to subscribe to.
     * @param socketId - The subscriber's socket ID.
     */
    addSubscription(username: string, socketId: string) {
        const sockets = this.userSubscribers.get(username) || new Set<string>();
        sockets.add(socketId);
        this.userSubscribers.set(username, sockets);

        const usernames =
            this.socketSubscriptions.get(socketId) || new Set<string>();
        usernames.add(username);
        this.socketSubscriptions.set(socketId, usernames);
    }

    /**
     * Removes a subscription.
     *
     * @param username - The username to unsubscribe from.
     * @param socketId - The subscriber's socket ID.
     */
    removeSubscription(username: string, socketId: string) {
        const sockets = this.userSubscribers.get(username);
        if (sockets) {
            sockets.delete(socketId);
            if (sockets.size === 0) {
                this.userSubscribers.delete(username);
            }
        }

        const usernames = this.socketSubscriptions.get(socketId);
        if (usernames) {
            usernames.delete(username);
            if (usernames.size === 0) {
                this.socketSubscriptions.delete(socketId);
            }
        }
    }

    /**
     * Clears all subscriptions for a socket (e.g., on disconnect).
     *
     * @param socketId - The socket ID to clear.
     */
    clearSubscriptionsForSocket(socketId: string) {
        const usernames = this.socketSubscriptions.get(socketId);
        if (!usernames) return;

        usernames.forEach((username) =>
            this.removeSubscription(username, socketId),
        );
    }

    getSubscribers(username: string): string[] {
        const set = this.userSubscribers.get(username);
        return set ? Array.from(set) : [];
    }

    /**
     * Publishes a status update to all subscribers.
     *
     * @param io - The Socket.IO server instance.
     * @param username - The username whose status changed.
     * @param status - The new status object.
     */
    publishStatusUpdate(io: any, username: string, status: any) {
        const sockets = this.userSubscribers.get(username);
        if (!sockets || sockets.size === 0) return;

        sockets.forEach((socketId) => {
            io.to(socketId).emit('status_update', { username, status });
        });
    }
}
