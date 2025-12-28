import { injectable } from 'inversify';
import {
    IServerMessageRepository,
    IServerMessage,
} from '@/di/interfaces/IServerMessageRepository';
import { ServerMessage } from '@/models/Server';
import { Reaction } from '@/models/Reaction';
import type { Types } from 'mongoose';

/**
 * Mongoose Server Message Repository
 *
 * Implements IServerMessageRepository using Mongoose ServerMessage model.
 */
@injectable()
export class MongooseServerMessageRepository
    implements IServerMessageRepository
{
    async create(data: {
        serverId: string | Types.ObjectId;
        channelId: string | Types.ObjectId;
        senderId: string | Types.ObjectId;
        text: string;
        isWebhook?: boolean;
        webhookUsername?: string;
        webhookAvatarUrl?: string;
        replyToId?: string | Types.ObjectId;
        repliedToMessageId?: Types.ObjectId;
    }): Promise<IServerMessage> {
        const message = new ServerMessage(data);
        const savedMessage = await message.save();
        return { ...savedMessage.toObject(), reactions: [] };
    }

    async delete(id: string): Promise<boolean> {
        const result = await ServerMessage.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async deleteByServerId(serverId: Types.ObjectId | string): Promise<number> {
        const result = await ServerMessage.deleteMany({ serverId });
        return result.deletedCount || 0;
    }

    async deleteByChannelId(channelId: string): Promise<number> {
        const result = await ServerMessage.deleteMany({ channelId });
        return result.deletedCount || 0;
    }

    async findById(id: string): Promise<IServerMessage | null> {
        const message = await ServerMessage.findById(id).lean();
        if (!message) return null;

        // Fetch reactions for this message
        const reactions = await this.getReactionsForMessages([message._id]);
        return {
            ...message,
            reactions: reactions[message._id.toString()] || [],
        };
    }

    /**
     * Find messages in a channel with pagination.
     *
     * Supports:
     * - 'before': Older messages before a specific ID or date.
     * - 'around': Contextual messages around a specific message (split limit).
     *
     * Automatically fetches and attaches aggregated reactions.
     */
    async findByChannelId(
        channelId: string,
        limit = 50,
        before?: string,
        around?: string,
    ): Promise<IServerMessage[]> {
        let messages: any[] = [];

        if (around) {
            const targetMessage = await ServerMessage.findById(around);
            if (!targetMessage) return [];

            const targetDate = targetMessage.createdAt;

            // Fetch messages before (older)
            const beforeMessages = await ServerMessage.find({
                channelId,
                createdAt: { $lt: targetDate },
            })
                .sort({ createdAt: -1 })
                .limit(Math.floor(limit / 2))
                .populate('repliedToMessageId')
                .lean();

            // Fetch messages after (newer) - inclusive of target
            const afterMessages = await ServerMessage.find({
                channelId,
                createdAt: { $gte: targetDate },
            })
                .sort({ createdAt: 1 })
                .limit(Math.ceil(limit / 2))
                .populate('repliedToMessageId')
                .lean();

            messages = [...beforeMessages, ...afterMessages].sort(
                (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
            );
        } else {
            const query: any = { channelId };

            if (before) {
                const isValidObjectId = /^[a-f\d]{24}$/i.test(before);
                if (isValidObjectId) {
                    query._id = { $lt: before };
                } else {
                    query.createdAt = { $lt: new Date(before) };
                }
            }

            messages = await ServerMessage.find(query)
                .sort({ createdAt: -1 })
                .limit(limit)
                .populate('repliedToMessageId')
                .lean();
        }

        if (messages.length === 0) return [];

        // Fetch and attach reactions
        const messageIds = messages.map((m) => m._id);
        const reactionsMap = await this.getReactionsForMessages(messageIds);

        return messages
            .map((msg) => ({
                ...msg,
                reactions: reactionsMap[msg._id.toString()] || [],
            }))
            .reverse();
    }

    async update(
        id: string,
        data: Partial<IServerMessage>,
    ): Promise<IServerMessage | null> {
        const updated = await ServerMessage.findByIdAndUpdate(id, data, {
            new: true,
        }).lean();
        if (!updated) return null;

        // Fetch reactions
        const reactions = await this.getReactionsForMessages([updated._id]);
        return {
            ...updated,
            reactions: reactions[updated._id.toString()] || [],
        };
    }

    /**
     * Helper to fetch aggregated reactions for multiple messages.
     *
     * Groups reactions by emoji type and collects user IDs.
     */
    private async getReactionsForMessages(
        messageIds: any[],
    ): Promise<Record<string, any[]>> {
        const reactions = await Reaction.aggregate([
            {
                $match: {
                    messageId: { $in: messageIds },
                    messageType: 'server',
                },
            },
            {
                $group: {
                    _id: {
                        messageId: '$messageId',
                        emoji: '$emoji',
                        emojiType: '$emojiType',
                        emojiId: '$emojiId',
                    },
                    count: { $sum: 1 },
                    userIds: { $push: '$userId' },
                    minCreatedAt: { $min: '$createdAt' }, // For consistent ordering
                },
            },
            {
                $sort: {
                    minCreatedAt: 1, // Sort by creation time of the first reaction of this type
                },
            },
            {
                $group: {
                    _id: '$_id.messageId',
                    reactions: {
                        $push: {
                            _id: {
                                emoji: '$_id.emoji',
                                emojiId: '$_id.emojiId',
                            },
                            count: '$count',
                            userIds: '$userIds',
                        },
                    },
                },
            },
        ]);

        const map: Record<string, any[]> = {};
        reactions.forEach((r) => {
            map[r._id.toString()] = r.reactions;
        });
        return map;
    }

    async countByChannelId(channelId: string): Promise<number> {
        return await ServerMessage.countDocuments({ channelId });
    }
}
