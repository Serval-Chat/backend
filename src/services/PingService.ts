import { injectable, inject } from 'inversify';
import { Inject } from '@nestjs/common';
import { TYPES } from '@/di/types';
import { IPingRepository } from '@/di/interfaces/IPingRepository';
import { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import type { IPing } from '@/di/interfaces/IPingRepository';
import {
    PingMentionMessageDTO,
    PingExportMessageDTO,
} from '@/controllers/dto/types.dto';
import { isValidSnowflakeId } from '@/utils/snowflake';

export interface PingNotification {
    id: string;
    type: 'mention' | 'export_status';
    sender: string;
    senderId: string;
    serverId?: string;
    channelId?: string;
    message: PingMentionMessageDTO | PingExportMessageDTO;
    timestamp: number;
}

// Ping Service wrapper for the ping repository
@injectable()
export class PingService {
    private readonly maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

    public constructor(
        @inject(TYPES.PingRepository)
        @Inject(TYPES.PingRepository)
        private pingRepo: IPingRepository,
        @inject(TYPES.FriendshipRepository)
        @Inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
    ) {}

    // Store a ping for a user (both online and offline)
    public async addPing(
        userId: string,
        pingData: Omit<PingNotification, 'id' | 'timestamp'>,
    ): Promise<PingNotification> {
        // Check if ping already exists
        const msg = pingData.message as {
            _id?: string;
            messageId?: string;
        };
        const messageId = (msg._id ?? msg.messageId ?? 'unknown').toString();
        const senderId = pingData.senderId.toString();

        if (!isValidSnowflakeId(senderId) || !isValidSnowflakeId(messageId)) {
            return {
                id: 'temporary',
                type: pingData.type,
                sender: pingData.sender,
                senderId: senderId,
                message: pingData.message,
                timestamp: Date.now(),
            };
        }

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
            type: 'mention' | 'export_status';
            sender: string;
            senderId: string;
            serverId?: string;
            channelId?: string;
            messageId: string;
            message: PingMentionMessageDTO | PingExportMessageDTO;
            timestamp?: Date;
        } = {
            userId,
            type: pingData.type,
            sender: pingData.sender,
            senderId,
            messageId,
            message: pingData.message,
        };

        if (pingData.serverId !== undefined && pingData.serverId !== '') {
            createData.serverId = pingData.serverId;
        }
        if (pingData.channelId !== undefined && pingData.channelId !== '') {
            createData.channelId = pingData.channelId;
        }

        const created = await this.pingRepo.create(createData);

        return this.mapToNotification(created);
    }

    // Get all pings for a user (with age filtering)
    public async getPingsForUser(userId: string): Promise<PingNotification[]> {
        const pings = await this.pingRepo.findByUserId(userId, this.maxAge);

        const dmPings = pings.filter(
            (p) => p.serverId === undefined || p.serverId === '',
        );
        const senderIds = [
            ...new Set(dmPings.map((p) => p.senderId.toString())),
        ];

        const validSenderIds = new Set<string>();
        await Promise.all(
            senderIds.map(async (senderIdStr) => {
                const areFriends = await this.friendshipRepo.areFriends(
                    userId,
                    senderIdStr,
                );
                if (areFriends) {
                    validSenderIds.add(senderIdStr);
                } else {
                    await this.pingRepo.deleteBetweenUsers(userId, senderIdStr);
                }
            }),
        );

        const filteredPings = pings.filter((p) => {
            if (p.serverId === undefined || p.serverId === '') {
                return validSenderIds.has(p.senderId.toString());
            }
            return true;
        });

        return filteredPings.map((p) => this.mapToNotification(p));
    }

    // Remove a specific ping
    public async removePing(userId: string, pingId: string): Promise<boolean> {
        return await this.pingRepo.delete(pingId);
    }

    // Clear all pings for a specific channel
    public async clearChannelPings(
        userId: string,
        channelId: string,
    ): Promise<number> {
        return await this.pingRepo.deleteByChannelId(userId, channelId);
    }

    public async clearServerPings(
        userId: string,
        serverId: string,
    ): Promise<number> {
        return await this.pingRepo.deleteByServerId(userId, serverId);
    }

    // Clear all pings for a user
    public async clearAllPings(userId: string): Promise<void> {
        await this.pingRepo.deleteByUserId(userId);
    }

    // Clear all DM pings between two users
    public async clearPingsBetweenUsers(
        user1: string,
        user2: string,
    ): Promise<number> {
        return await this.pingRepo.deleteBetweenUsers(user1, user2);
    }

    // Map database ping to notification format
    private mapToNotification(ping: IPing): PingNotification {
        const notification: PingNotification = {
            id: ping.snowflakeId,
            type: ping.type,
            sender: ping.sender,
            senderId: ping.senderId.toString(),
            message: ping.message,
            timestamp:
                ping.timestamp instanceof Date
                    ? ping.timestamp.getTime()
                    : new Date(ping.timestamp).getTime(),
        };

        if (ping.serverId !== undefined && ping.serverId !== '') {
            notification.serverId = ping.serverId.toString();
        }
        if (ping.channelId !== undefined && ping.channelId !== '') {
            notification.channelId = ping.channelId.toString();
        }

        return notification;
    }
}
