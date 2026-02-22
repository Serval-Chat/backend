import { injectable, inject } from 'inversify';
import mongoose from 'mongoose';
import { Injectable, Inject } from '@nestjs/common';
import { TYPES } from '@/di/types';
import { IPingRepository } from '@/di/interfaces/IPingRepository';
import type { IPing } from '@/di/interfaces/IPingRepository';

export interface PingNotification {
    id: string;
    type: 'mention';
    sender: string;
    senderId: string;
    serverId?: string;
    channelId?: string;
    message: Record<string, unknown>;
    timestamp: number;
}

// Ping Service wrapper for the ping repository
@injectable()
@Injectable()
export class PingService {
    private readonly maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

    constructor(
        @inject(TYPES.PingRepository)
        @Inject(TYPES.PingRepository)
        private pingRepo: IPingRepository,
    ) { }

    // Store a ping for a user (both online and offline)
    async addPing(
        userId: mongoose.Types.ObjectId,
        pingData: Omit<PingNotification, 'id' | 'timestamp'>,
    ): Promise<PingNotification> {
        // Check if ping already exists
        const msg = pingData.message as {
            _id?: string;
            messageId?: string;
        };
        const messageId = (msg?._id || msg?.messageId)?.toString() || 'unknown';
        const senderId = pingData.senderId?.toString() || 'unknown';

        const exists = await this.pingRepo.exists(
            userId,
            new mongoose.Types.ObjectId(senderId),
            new mongoose.Types.ObjectId(messageId),
        );
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
            userId: mongoose.Types.ObjectId;
            type: 'mention';
            sender: string;
            senderId: mongoose.Types.ObjectId;
            serverId?: mongoose.Types.ObjectId;
            channelId?: mongoose.Types.ObjectId;
            messageId: mongoose.Types.ObjectId;
            message: Record<string, unknown>;
            timestamp?: Date;
        } = {
            userId,
            type: 'mention',
            sender: pingData.sender,
            senderId: new mongoose.Types.ObjectId(senderId),
            messageId: new mongoose.Types.ObjectId(messageId),
            message: pingData.message,
        };

        if (pingData.serverId) {
            createData.serverId = new mongoose.Types.ObjectId(pingData.serverId);
        }
        if (pingData.channelId) {
            createData.channelId = new mongoose.Types.ObjectId(pingData.channelId);
        }

        const created = await this.pingRepo.create(createData);

        return this.mapToNotification(created);
    }

    // Get all pings for a user (with age filtering)
    async getPingsForUser(userId: mongoose.Types.ObjectId): Promise<PingNotification[]> {
        const pings = await this.pingRepo.findByUserId(userId, this.maxAge);
        return pings.map((p) => this.mapToNotification(p));
    }

    // Remove a specific ping
    async removePing(
        userId: mongoose.Types.ObjectId,
        pingId: mongoose.Types.ObjectId,
    ): Promise<boolean> {
        return await this.pingRepo.delete(pingId);
    }

    // Clear all pings for a specific channel
    async clearChannelPings(
        userId: mongoose.Types.ObjectId,
        channelId: mongoose.Types.ObjectId,
    ): Promise<number> {
        return await this.pingRepo.deleteByChannelId(userId, channelId);
    }

    // Clear all pings for a user
    async clearAllPings(userId: mongoose.Types.ObjectId): Promise<void> {
        await this.pingRepo.deleteByUserId(userId);
    }

    // Map database ping to notification format
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
