import { injectable } from 'inversify';
import type {
    IServerMessageRepository,
    IServerMessage,
} from '@/di/interfaces/IServerMessageRepository';
import type { InteractionValue } from '@/types/interactions';
import { ServerMessage } from '@/models/Server';
import { IEmbed } from '@/models/Embed';
import { Reaction } from '@/models/Reaction';
import type { IPoll } from '@/models/Message';
import {
    type QueryFilter,
    Types,
    ClientSession,
    type UpdateQuery,
} from 'mongoose';
import type { ReactionData } from '@/di/interfaces/IReactionRepository';
import type { IMessageAttachment } from '@/models/Attachment';
import { isValidSnowflakeId } from '@/utils/snowflake';

type PopulatedServerMessageDoc = IServerMessage & {
    repliedToMessage?: PopulatedServerMessageDoc;
};

// Mongoose Server Message repository
//
// Implements IServerMessageRepository using Mongoose ServerMessage model
@injectable()
export class MongooseServerMessageRepository
    implements IServerMessageRepository
{
    private transformMessage(msg: PopulatedServerMessageDoc): IServerMessage {
        const transformed = { ...msg } as IServerMessage;
        delete (transformed as Partial<PopulatedServerMessageDoc>)
            .repliedToMessage;

        if (msg.repliedToMessage) {
            transformed.referenced_message = this.transformMessage(
                msg.repliedToMessage,
            );
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
            .filter(
                (m) =>
                    m.referenced_message === undefined &&
                    m.replyToId !== undefined,
            )
            .map((m) => m.replyToId ?? '')
            .filter((id) => id !== '');

        // Skip legacy replyToId lookup if all messages are modern (populated via repliedToMessageId)
        if (replyToIds.length === 0) return transformed;

        // Legacy replyToId references are only populated one level deep; nested replies within legacy messages will not have referenced_message set.
        const replyDocs = (await ServerMessage.find({
            snowflakeId: { $in: replyToIds },
        }).lean()) as PopulatedServerMessageDoc[];
        const replyMap = new Map(replyDocs.map((d) => [d.snowflakeId, d]));

        return transformed.map((m) => {
            if (
                m.referenced_message === undefined &&
                m.replyToId !== undefined
            ) {
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

    public async create(
        data: {
            serverId: string | Types.ObjectId;
            channelId: string | Types.ObjectId;
            senderId: string | Types.ObjectId;
            text: string;
            isWebhook?: boolean;
            webhookUsername?: string;
            webhookAvatarUrl?: string;
            replyToId?: string;
            repliedToMessageId?: string;
            embeds?: IEmbed[];
            attachments?: IMessageAttachment[];
            interaction?: {
                command: string;
                options: { name: string; value: InteractionValue }[];
                user: { id: string; username: string };
            };
            stickerId?: string;
            poll?: IPoll;
            noEmbeds?: boolean;
        },
        session?: ClientSession,
    ): Promise<IServerMessage> {
        const createData = {
            ...data,
            serverId: data.serverId.toString(),
            channelId: data.channelId.toString(),
            senderId: data.senderId.toString(),
        };
        const message = new ServerMessage(createData);
        const savedMessage = await message.save({ session });
        return this.transformMessage(
            savedMessage.toObject({
                transform: false,
            }),
        );
    }

    public async delete(id: string): Promise<boolean> {
        const result = await ServerMessage.updateOne(
            { snowflakeId: id },
            { $set: { deletedAt: new Date() } },
        );
        return result.modifiedCount > 0;
    }

    public async deleteByServerId(serverId: string): Promise<number> {
        const result = await ServerMessage.deleteMany({ serverId });
        return result.deletedCount;
    }

    public async deleteByChannelId(channelId: string): Promise<number> {
        const result = await ServerMessage.deleteMany({ channelId });
        return result.deletedCount;
    }

    public async bulkDelete(channelId: string, ids: string[]): Promise<number> {
        const result = await ServerMessage.updateMany(
            {
                channelId: channelId,
                snowflakeId: { $in: ids },
            },
            { $set: { deletedAt: new Date() } },
        );
        return result.modifiedCount;
    }

    public async findById(
        id: string,
        includeDeleted?: boolean,
    ): Promise<IServerMessage | null> {
        const filter: QueryFilter<IServerMessage> = { snowflakeId: id };
        if (includeDeleted !== true) {
            filter.deletedAt = { $exists: false };
        }

        const message = (await ServerMessage.findOne(filter)
            .populate({
                path: 'repliedToMessage',
                populate: { path: 'repliedToMessage' },
            })
            .lean()) as PopulatedServerMessageDoc | null;
        if (!message) return null;

        // Fetch reactions for this message
        const reactions = await this.getReactionsForMessages([
            message.snowflakeId,
        ]);
        const msg = {
            ...message,
            reactions: reactions[message.snowflakeId] || [],
        } as PopulatedServerMessageDoc;
        return this.transformMessage(msg);
    }

    // Find messages in a channel with pagination
    public async findByChannelId(
        channelId: string,
        limit = 50,
        before?: string,
        around?: string,
        after?: string,
        includeDeleted?: boolean,
    ): Promise<IServerMessage[]> {
        let messages: PopulatedServerMessageDoc[] = [];

        if (around !== undefined && around !== '') {
            const targetFilter: QueryFilter<IServerMessage> = {
                snowflakeId: around,
            };
            if (includeDeleted !== true) {
                targetFilter.deletedAt = { $exists: false };
            }

            const targetMessage = (await ServerMessage.findOne(
                targetFilter,
            ).lean()) as PopulatedServerMessageDoc | null;
            if (!targetMessage) return [];

            const targetDate = targetMessage.createdAt;

            const commonFilter: QueryFilter<IServerMessage> = {
                channelId: channelId,
            };
            if (includeDeleted !== true) {
                commonFilter.deletedAt = { $exists: false };
            }

            const beforeMessages = (await ServerMessage.find({
                ...commonFilter,
                createdAt: { $lt: targetDate },
            })
                .sort({ createdAt: -1 })
                .limit(Math.floor(limit / 2))
                .populate({
                    path: 'repliedToMessage',
                    populate: { path: 'repliedToMessage' },
                })
                .lean()) as PopulatedServerMessageDoc[];

            const afterMessages = (await ServerMessage.find({
                ...commonFilter,
                createdAt: { $gte: targetDate },
            })
                .sort({ createdAt: 1 })
                .limit(Math.ceil(limit / 2))
                .populate({
                    path: 'repliedToMessage',
                    populate: { path: 'repliedToMessage' },
                })
                .lean()) as PopulatedServerMessageDoc[];

            // Sort chronologically
            messages = [...beforeMessages, ...afterMessages].sort(
                (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
            );
        } else {
            const query: QueryFilter<IServerMessage> = {
                channelId: channelId,
            };
            if (includeDeleted !== true) {
                query.deletedAt = { $exists: false };
            }

            if (before !== undefined && before !== '') {
                if (isValidSnowflakeId(before)) {
                    query.snowflakeId = { $lt: before };
                } else {
                    query.createdAt = { $lt: new Date(before) };
                }
            } else if (after !== undefined && after !== '') {
                if (isValidSnowflakeId(after)) {
                    query.snowflakeId = { $gt: after };
                } else {
                    query.createdAt = { $gt: new Date(after) };
                }
            }

            const docs = (await ServerMessage.find(query)
                .sort({
                    createdAt: after !== undefined && after !== '' ? 1 : -1,
                })
                .limit(limit)
                .populate({
                    path: 'repliedToMessage',
                    populate: { path: 'repliedToMessage' },
                })
                .lean()) as PopulatedServerMessageDoc[];

            messages = docs;
            if (after === undefined || after === '') {
                messages.reverse();
            }
        }

        if (messages.length === 0) return [];

        return await this.transformMessages(messages);
    }

    public async update(
        id: string,
        data: Partial<IServerMessage>,
    ): Promise<IServerMessage | null> {
        const updated = (await ServerMessage.findOneAndUpdate(
            { snowflakeId: id },
            data,
            { new: true },
        )
            .populate({
                path: 'repliedToMessage',
                populate: { path: 'repliedToMessage' },
            })
            .lean()) as PopulatedServerMessageDoc | null;
        if (!updated) return null;

        // Fetch reactions
        const reactions = await this.getReactionsForMessages([
            updated.snowflakeId,
        ]);
        const msg = {
            ...updated,
            reactions: reactions[updated.snowflakeId] || [],
        } as PopulatedServerMessageDoc;
        return this.transformMessage(msg);
    }

    public async setPollVote(
        id: string,
        userId: string,
        optionIds: string[],
    ): Promise<IServerMessage | null> {
        await ServerMessage.updateOne(
            { snowflakeId: id },
            {
                $pull: { 'poll.options.$[].votes': userId },
            },
        );
        if (optionIds.length > 0) {
            await ServerMessage.updateOne(
                { snowflakeId: id },
                {
                    $addToSet: { 'poll.options.$[opt].votes': userId },
                },
                { arrayFilters: [{ 'opt.id': { $in: optionIds } }] },
            );
        }
        return this.findById(id);
    }

    // Helper to fetch aggregated reactions for multiple messages
    //
    // Groups reactions by emoji type and collects user IDs
    private async getReactionsForMessages(
        messageIds: string[],
    ): Promise<Record<string, ReactionData[]>> {
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

        const map: Record<string, ReactionData[]> = {};
        reactions.forEach((r) => {
            map[r._id.toString()] = r.reactions;
        });
        return map;
    }

    public async countByChannelId(
        channelId: string,
        includeDeleted?: boolean,
    ): Promise<number> {
        const filter: QueryFilter<IServerMessage> = { channelId };
        if (includeDeleted !== true) {
            filter.deletedAt = { $exists: false };
        }
        return await ServerMessage.countDocuments(filter);
    }

    public async countByServerId(serverId: string): Promise<number> {
        return await ServerMessage.countDocuments({ serverId });
    }

    public findCursorByChannelId(
        channelId: string,
    ): AsyncIterable<IServerMessage> {
        return ServerMessage.find({ channelId })
            .sort({ createdAt: 1 })
            .lean()
            .cursor();
    }

    public async findLastByChannelAndUser(
        channelId: string,
        userId: string,
        includeDeleted?: boolean,
    ): Promise<IServerMessage | null> {
        const filter: QueryFilter<IServerMessage> = {
            channelId,
            senderId: userId,
        };
        if (includeDeleted !== true) {
            filter.deletedAt = { $exists: false };
        }
        const doc = await ServerMessage.findOne(filter)
            .sort({ createdAt: -1 })
            .lean();
        return doc ? this.transformMessage(doc) : null;
    }
    public async findPinnedByChannelId(
        channelId: string,
        includeDeleted?: boolean,
    ): Promise<IServerMessage[]> {
        const filter: QueryFilter<IServerMessage> = {
            channelId: channelId,
            $or: [{ isPinned: true }, { isSticky: true }],
        };
        if (includeDeleted !== true) {
            filter.deletedAt = { $exists: false };
        }
        const messages = (await ServerMessage.find(filter)
            .sort({ createdAt: -1 })
            .populate({
                path: 'repliedToMessage',
                populate: { path: 'repliedToMessage' },
            })
            .lean()) as PopulatedServerMessageDoc[];
        if (messages.length === 0) return [];
        return await this.transformMessages(messages);
    }

    public async count(): Promise<number> {
        return await ServerMessage.estimatedDocumentCount();
    }

    public async countCreatedAfter(date: Date): Promise<number> {
        return await ServerMessage.countDocuments({
            createdAt: { $gte: date },
        });
    }

    public async countByHour(since: Date, hours: number): Promise<number[]> {
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

    public async countByDay(since: Date, days: number): Promise<number[]> {
        if (days <= 0 || !Number.isFinite(days) || days > 10000) {
            return [];
        }

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

    public async countAllByDay(): Promise<number[]> {
        const oldestMessage = await ServerMessage.findOne()
            .sort({ createdAt: 1 })
            .lean();
        if (!oldestMessage) return [];

        const now = new Date();
        const startOfOldestDay = new Date(oldestMessage.createdAt);
        startOfOldestDay.setHours(0, 0, 0, 0);

        const diffTime = Math.abs(now.getTime() - startOfOldestDay.getTime());
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return this.countByDay(startOfOldestDay, days);
    }
}
