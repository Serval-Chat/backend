import { injectable } from 'inversify';
import {
    IServerMessageRepository,
    IServerMessage,
} from '@/di/interfaces/IServerMessageRepository';
import { ServerMessage } from '@/models/Server';
import { Reaction } from '@/models/Reaction';
import { type FilterQuery, Types, ClientSession } from 'mongoose';

type PopulatedServerMessageDoc = Omit<IServerMessage, 'repliedToMessageId'> & {
    repliedToMessageId?: Types.ObjectId | PopulatedServerMessageDoc;
};

// Mongoose Server Message repository
//
// Implements IServerMessageRepository using Mongoose ServerMessage model
@injectable()
export class MongooseServerMessageRepository
    implements IServerMessageRepository
{
    private transformMessage(msg: PopulatedServerMessageDoc): IServerMessage {
        const transformed = { ...msg } as unknown as IServerMessage;

        if (msg.repliedToMessageId) {
            if (msg.repliedToMessageId instanceof Types.ObjectId) {
                transformed.repliedToMessageId = msg.repliedToMessageId;
            } else if (typeof msg.repliedToMessageId === 'object') {
                // It's a populated document
                const populated =
                    msg.repliedToMessageId as PopulatedServerMessageDoc;
                transformed.repliedToMessageId = populated._id;
                transformed.referenced_message =
                    this.transformMessage(populated);
            }
        }
        return transformed;
    }

    // Applies transformMessage to a batch, then resolves legacy replyToId references.
    private async transformMessages(
        messages: PopulatedServerMessageDoc[],
    ): Promise<IServerMessage[]> {
        const transformed = messages.map((msg) => this.transformMessage(msg));

        // Collect IDs of messages that still lack referenced_message but have replyToId
        const replyToIds = transformed
            .filter((m) => !m.referenced_message && m.replyToId)
            .map((m) => m.replyToId!.toString());

        // Skip legacy replyToId lookup if all messages are modern (populated via repliedToMessageId)
        if (replyToIds.length === 0) return transformed;

        // Legacy replyToId references are only populated one level deep; nested replies within legacy messages will not have referenced_message set.
        const replyDocs = (await ServerMessage.find({
            _id: { $in: replyToIds },
        }).lean()) as unknown as PopulatedServerMessageDoc[];
        const replyMap = new Map(replyDocs.map((d) => [d._id.toString(), d]));

        return transformed.map((m) => {
            if (!m.referenced_message && m.replyToId) {
                const ref = replyMap.get(m.replyToId.toString());
                if (ref) {
                    return {
                        ...m,
                        referenced_message: this.transformMessage(ref),
                    };
                }
            }
            return m;
        });
    }

    async create(
        data: {
            serverId: string | Types.ObjectId;
            channelId: string | Types.ObjectId;
            senderId: string | Types.ObjectId;
            text: string;
            isWebhook?: boolean;
            webhookUsername?: string;
            webhookAvatarUrl?: string;
            replyToId?: string | Types.ObjectId;
            repliedToMessageId?: Types.ObjectId;
        },
        session?: ClientSession,
    ): Promise<IServerMessage> {
        const createData = {
            ...data,
            serverId: new Types.ObjectId(data.serverId),
            channelId: new Types.ObjectId(data.channelId),
            senderId: new Types.ObjectId(data.senderId),
            replyToId: data.replyToId
                ? new Types.ObjectId(data.replyToId)
                : undefined,
        };
        const message = new ServerMessage(createData);
        const savedMessage = await message.save({ session });
        return this.transformMessage(savedMessage.toObject());
    }

    async delete(id: Types.ObjectId): Promise<boolean> {
        const result = await ServerMessage.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async deleteByServerId(serverId: Types.ObjectId): Promise<number> {
        const result = await ServerMessage.deleteMany({ serverId });
        return result.deletedCount || 0;
    }

    async deleteByChannelId(channelId: Types.ObjectId): Promise<number> {
        const result = await ServerMessage.deleteMany({ channelId });
        return result.deletedCount || 0;
    }

    async findById(id: Types.ObjectId): Promise<IServerMessage | null> {
        const message = (await ServerMessage.findById(id)
            .populate({
                path: 'repliedToMessageId',
                populate: { path: 'repliedToMessageId' },
            })
            .lean()) as unknown as PopulatedServerMessageDoc | null;
        if (!message) return null;

        // Fetch reactions for this message
        const reactions = await this.getReactionsForMessages([message._id]);
        const msg = {
            ...message,
            reactions: reactions[message._id.toString()] || [],
        } as unknown as PopulatedServerMessageDoc;
        return this.transformMessage(msg);
    }

    // Find messages in a channel with pagination
    async findByChannelId(
        channelId: Types.ObjectId,
        limit = 50,
        before?: string,
        around?: string,
        after?: string,
    ): Promise<IServerMessage[]> {
        let messages: PopulatedServerMessageDoc[] = [];

        if (around) {
            const targetMessage = (await ServerMessage.findById(
                new Types.ObjectId(around),
            ).lean()) as PopulatedServerMessageDoc | null;
            if (!targetMessage) return [];

            const targetDate = targetMessage.createdAt;

            const beforeMessages = (await ServerMessage.find({
                channelId: new Types.ObjectId(channelId.toString()),
                createdAt: { $lt: targetDate },
            })
                .sort({ createdAt: -1 })
                .limit(Math.floor(limit / 2))
                .populate({
                    path: 'repliedToMessageId',
                    populate: { path: 'repliedToMessageId' },
                })
                .lean()) as unknown as PopulatedServerMessageDoc[];

            const afterMessages = (await ServerMessage.find({
                channelId: new Types.ObjectId(channelId.toString()),
                createdAt: { $gte: targetDate },
            })
                .sort({ createdAt: 1 })
                .limit(Math.ceil(limit / 2))
                .populate({
                    path: 'repliedToMessageId',
                    populate: { path: 'repliedToMessageId' },
                })
                .lean()) as unknown as PopulatedServerMessageDoc[];

            // Sort chronologically
            messages = [...beforeMessages, ...afterMessages].sort(
                (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
            );
        } else {
            const query: FilterQuery<IServerMessage> = {
                channelId: new Types.ObjectId(channelId.toString()),
            };

            if (before) {
                const isValidObjectId = /^[a-f\d]{24}$/i.test(before);
                if (isValidObjectId) {
                    query._id = { $lt: new Types.ObjectId(before) };
                } else {
                    query.createdAt = { $lt: new Date(before) };
                }
            } else if (after) {
                const isValidObjectId = /^[a-f\d]{24}$/i.test(after);
                if (isValidObjectId) {
                    query._id = { $gt: new Types.ObjectId(after) };
                } else {
                    query.createdAt = { $gt: new Date(after) };
                }
            }

            const docs = (await ServerMessage.find(query)
                .sort({ createdAt: after ? 1 : -1 })
                .limit(limit)
                .populate({
                    path: 'repliedToMessageId',
                    populate: { path: 'repliedToMessageId' },
                })
                .lean()) as unknown as PopulatedServerMessageDoc[];

            messages = docs;
            if (!after) {
                messages.reverse();
            }
        }

        if (messages.length === 0) return [];

        return await this.transformMessages(messages);
    }

    async update(
        id: Types.ObjectId,
        data: Partial<IServerMessage>,
    ): Promise<IServerMessage | null> {
        const updated = (await ServerMessage.findByIdAndUpdate(id, data, {
            new: true,
        })
            .populate({
                path: 'repliedToMessageId',
                populate: { path: 'repliedToMessageId' },
            })
            .lean()) as unknown as PopulatedServerMessageDoc | null;
        if (!updated) return null;

        // Fetch reactions
        const reactions = await this.getReactionsForMessages([updated._id]);
        const msg = {
            ...updated,
            reactions: reactions[updated._id.toString()] || [],
        } as unknown as PopulatedServerMessageDoc;
        return this.transformMessage(msg);
    }

    // Helper to fetch aggregated reactions for multiple messages
    //
    // Groups reactions by emoji type and collects user IDs
    private async getReactionsForMessages(
        messageIds: (string | Types.ObjectId)[],
    ): Promise<Record<string, unknown[]>> {
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

        const map: Record<string, unknown[]> = {};
        reactions.forEach((r) => {
            map[r._id.toString()] = r.reactions;
        });
        return map;
    }

    async countByChannelId(channelId: Types.ObjectId): Promise<number> {
        return await ServerMessage.countDocuments({ channelId });
    }

    async countByServerId(serverId: Types.ObjectId): Promise<number> {
        return await ServerMessage.countDocuments({ serverId });
    }

    findCursorByChannelId(
        channelId: Types.ObjectId,
    ): AsyncIterable<IServerMessage> {
        return ServerMessage.find({ channelId })
            .sort({ createdAt: 1 })
            .lean()
            .cursor();
    }

    async findLastByChannelAndUser(
        channelId: Types.ObjectId,
        userId: Types.ObjectId,
    ): Promise<IServerMessage | null> {
        const doc = await ServerMessage.findOne({ channelId, senderId: userId })
            .sort({ createdAt: -1 })
            .lean();
        return doc
            ? this.transformMessage(doc as unknown as PopulatedServerMessageDoc)
            : null;
    }
    async findPinnedByChannelId(
        channelId: Types.ObjectId,
    ): Promise<IServerMessage[]> {
        const messages = (await ServerMessage.find({
            channelId: new Types.ObjectId(channelId.toString()),
            $or: [{ isPinned: true }, { isSticky: true }],
        })
            .sort({ createdAt: -1 })
            .populate({
                path: 'repliedToMessageId',
                populate: { path: 'repliedToMessageId' },
            })
            .lean()) as unknown as PopulatedServerMessageDoc[];
        if (messages.length === 0) return [];
        return await this.transformMessages(messages);
    }

    async count(): Promise<number> {
        return await ServerMessage.estimatedDocumentCount();
    }

    async countCreatedAfter(date: Date): Promise<number> {
        return await ServerMessage.countDocuments({
            createdAt: { $gte: date },
        });
    }

    async countByHour(since: Date, hours: number): Promise<number[]> {
        const msPerHour = 1000 * 60 * 60;
        const buckets = await ServerMessage.aggregate<{
            _id: number;
            count: number;
        }>([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: {
                        $floor: {
                            $divide: [
                                { $subtract: ['$createdAt', since] },
                                msPerHour,
                            ],
                        },
                    },
                    count: { $sum: 1 },
                },
            },
        ]);
        const result = Array<number>(hours).fill(0);
        for (const b of buckets) {
            const idx = Math.floor(b._id);
            if (idx >= 0 && idx < hours) result[idx] = b.count;
        }
        return result;
    }

    async countByDay(since: Date, days: number): Promise<number[]> {
        const msPerDay = 1000 * 60 * 60 * 24;
        const buckets = await ServerMessage.aggregate<{
            _id: number;
            count: number;
        }>([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: {
                        $floor: {
                            $divide: [
                                { $subtract: ['$createdAt', since] },
                                msPerDay,
                            ],
                        },
                    },
                    count: { $sum: 1 },
                },
            },
        ]);
        const result = Array<number>(days).fill(0);
        for (const b of buckets) {
            const idx = Math.floor(b._id);
            if (idx >= 0 && idx < days) result[idx] = b.count;
        }
        return result;
    }

    async countAllByDay(): Promise<number[]> {
        const oldestMessage = await ServerMessage.findOne()
            .sort({ createdAt: 1 })
            .lean();
        if (!oldestMessage || !oldestMessage.createdAt) return [];

        const now = new Date();
        const startOfOldestDay = new Date(oldestMessage.createdAt);
        startOfOldestDay.setHours(0, 0, 0, 0);

        const diffTime = Math.abs(now.getTime() - startOfOldestDay.getTime());
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return this.countByDay(startOfOldestDay, days);
    }
}
