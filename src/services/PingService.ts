import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types';
import { IPingRepository } from '../di/interfaces/IPingRepository';
import type { IPing } from '../di/interfaces/IPingRepository';

export interface PingNotification {
    id: string;
    type: 'mention';
    sender: string;
    senderId: string;
    serverId?: string;
    channelId?: string;
    message: any;
    timestamp: number;
}

/**
 * Ping Service - Just a nice wrapper for the ping repository
 */
@injectable()
export class PingService {
    private readonly maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

    constructor(
        @inject(TYPES.PingRepository) private pingRepo: IPingRepository,
    ) {}

    /**
     * Store a ping for a user (both online and offline)
     */
    async addPing(
        userId: string,
        pingData: Omit<PingNotification, 'id' | 'timestamp'>,
    ): Promise<PingNotification> {
        // Check if ping already exists (deduplication)
        const messageId =
            typeof pingData.message._id === 'string'
                ? pingData.message._id
                : (pingData.message._id as any).toString();
        const senderId =
            typeof pingData.senderId === 'string'
                ? pingData.senderId
                : (pingData.senderId as any).toString();

        const exists = await this.pingRepo.exists(userId, senderId, messageId);
        if (exists) {
            // Return existing ping format
            const existingPings = await this.pingRepo.findByUserId(userId);
            const existing = existingPings.find(
                (p) =>
                    p.senderId.toString() === senderId &&
                    p.messageId.toString() === messageId,
            );
            if (existing) {
                return this.mapToNotification(existing);
            }
        }

        // Create new ping
        const createData: {
            userId: string;
            type: 'mention';
            sender: string;
            senderId: string;
            serverId?: string;
            channelId?: string;
            messageId: string;
            message: any;
            timestamp?: Date;
        } = {
            userId,
            type: 'mention',
            sender: pingData.sender,
            senderId,
            messageId,
            message: pingData.message,
        };

        if (pingData.serverId) {
            createData.serverId = pingData.serverId;
        }
        if (pingData.channelId) {
            createData.channelId = pingData.channelId;
        }

        const created = await this.pingRepo.create(createData);

        return this.mapToNotification(created);
    }

    /**
     * Get all pings for a user (with age filtering)
     */
    async getPingsForUser(userId: string): Promise<PingNotification[]> {
        const pings = await this.pingRepo.findByUserId(userId, this.maxAge);
        return pings.map((p) => this.mapToNotification(p));
    }

    /**
     * Remove a specific ping
     */
    async removePing(userId: string, pingId: string): Promise<boolean> {
        return await this.pingRepo.delete(pingId);
    }

    /**
     * Clear all pings for a specific channel
     */
    async clearChannelPings(
        userId: string,
        channelId: string,
    ): Promise<number> {
        return await this.pingRepo.deleteByChannelId(userId, channelId);
    }

    /**
     * Clear all pings for a user
     */
    async clearAllPings(userId: string): Promise<void> {
        await this.pingRepo.deleteByUserId(userId);
    }

    /**
     * Map database ping to notification format
     */
    private mapToNotification(ping: IPing): PingNotification {
        const notification: PingNotification = {
            id: ping._id.toString(),
            type: ping.type,
            sender: ping.sender,
            senderId: ping.senderId.toString(),
            message: ping.message,
            timestamp:
                ping.timestamp instanceof Date
                    ? ping.timestamp.getTime()
                    : new Date(ping.timestamp).getTime(),
        };

        if (ping.serverId) {
            notification.serverId = ping.serverId.toString();
        }
        if (ping.channelId) {
            notification.channelId = ping.channelId.toString();
        }

        return notification;
    }
}
