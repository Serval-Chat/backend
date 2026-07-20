import { type QueryFilter, ClientSession, type UpdateQuery } from 'mongoose';
import {
    IMessageRepository,
    IMessage,
} from '@/di/interfaces/IMessageRepository';
import { Message, type IPoll } from '@/models/Message';
import { injectable } from 'inversify';
import type { IMessageAttachment } from '@/models/Attachment';
import { isValidSnowflakeId } from '@/utils/snowflake';

type PopulatedMessageDoc = IMessage & {
    repliedToMessage?: PopulatedMessageDoc;
};

// Mongoose Message repository
@injectable()
export class MongooseMessageRepository implements IMessageRepository {
    private messageModel = Message;
    public constructor() {}

    private transformMessage(msg: PopulatedMessageDoc): IMessage {
        const transformed = { ...msg } as IMessage;
        delete (transformed as Partial<PopulatedMessageDoc>).repliedToMessage;

        if (msg.repliedToMessage) {
            transformed.referenced_message = this.transformMessage(
                msg.repliedToMessage,
            );
        }

        return transformed;
    }

    private async transformMessages(
        messages: PopulatedMessageDoc[],
    ): Promise<IMessage[]> {
        const transformed = messages.map((msg) => this.transformMessage(msg));

        const replyToIds = transformed
            .filter(
                (m) =>
                    m.referenced_message === undefined &&
                    m.replyToId !== undefined,
            )
            .map((m) => m.replyToId as string);

        // Skip legacy replyToId lookup if all messages are modern (populated via repliedToMessageId)
        if (replyToIds.length === 0) return transformed;

        // Legacy replyToId references are only populated one level deep; nested replies within legacy messages will not have referenced_message set.
        const replyDocs = (await this.messageModel
            .find({ snowflakeId: { $in: replyToIds } })
            .lean()) as PopulatedMessageDoc[];
        const replyMap = new Map(replyDocs.map((d) => [d.snowflakeId, d]));

        return transformed.map((m) => {
            if (
                m.referenced_message === undefined &&
                m.replyToId !== undefined
            ) {
                const ref = replyMap.get(m.replyToId);
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

    public async findById(id: string): Promise<IMessage | null> {
        const msg = (await this.messageModel
            .findOne({ snowflakeId: id })
            .populate({
                path: 'repliedToMessage',
                populate: { path: 'repliedToMessage' },
            })
            .lean()) as PopulatedMessageDoc | null;
        return msg ? this.transformMessage(msg) : null;
    }

    // Find messages between two users with pagination
    public async findByConversation(
        user1Id: string,
        user2Id: string,
        limit = 50,
        before?: string,
        around?: string,
        after?: string,
    ): Promise<IMessage[]> {
        const baseQuery: QueryFilter<IMessage> = {
            $or: [
                { senderId: user1Id, receiverId: user2Id },
                { senderId: user2Id, receiverId: user1Id },
            ],
        };

        if (around !== undefined && around !== '') {
            const targetMessage = (await this.messageModel
                .findOne({ snowflakeId: around })
                .lean()) as PopulatedMessageDoc | null;
            if (!targetMessage) return [];

            const targetDate = targetMessage.createdAt;

            // Fetch messages before (older)
            const beforeQuery = {
                ...baseQuery,
                createdAt: { $lt: targetDate },
            };
            const beforeMessages = (await this.messageModel
                .find(beforeQuery)
                .sort({ createdAt: -1 })
                .limit(Math.floor(limit / 2))
                .populate({
                    path: 'repliedToMessage',
                    populate: { path: 'repliedToMessage' },
                })
                .lean()) as PopulatedMessageDoc[];

            const afterMessages = (await this.messageModel
                .find({
                    ...baseQuery,
                    createdAt: { $gte: targetDate },
                })
                .sort({ createdAt: 1 }) // Ascending to get closest to target
                .limit(Math.ceil(limit / 2))
                .populate({
                    path: 'repliedToMessage',
                    populate: { path: 'repliedToMessage' },
                })
                .lean()) as PopulatedMessageDoc[];

            // Combine and sort chronologically
            const combined = [...beforeMessages, ...afterMessages].sort(
                (a, b) =>
                    (a.createdAt?.getTime() ?? 0) -
                    (b.createdAt?.getTime() ?? 0),
            );
            return await this.transformMessages(combined);
        }

        const query = { ...baseQuery };

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

        const messages = (await this.messageModel
            .find(query)
            .sort({ createdAt: after !== undefined && after !== '' ? 1 : -1 })
            .limit(limit)
            .populate({
                path: 'repliedToMessage',
                populate: { path: 'repliedToMessage' },
            })
            .lean()) as PopulatedMessageDoc[];

        if (after === undefined || after === '') {
            messages.reverse();
        }

        return await this.transformMessages(messages);
    }

    public async create(
        data: {
            senderId: string;
            receiverId: string;
            text: string;
            replyToId?: string;
            repliedToMessageId?: string;
            poll?: IPoll;
            attachments?: IMessageAttachment[];
            noEmbeds?: boolean;
        },
        session?: ClientSession,
    ): Promise<IMessage> {
        const message = new this.messageModel(data);
        const savedMessage = await message.save({ session });
        const msgObj = savedMessage.toObject({ transform: false });
        return this.transformMessage(msgObj);
    }

    public async update(id: string, text: string): Promise<IMessage | null> {
        const msg = (await this.messageModel
            .findOneAndUpdate(
                { snowflakeId: id },
                {
                    text,
                    editedAt: new Date(),
                    isEdited: true,
                },
                { returnDocument: 'after' },
            )
            .populate({
                path: 'repliedToMessage',
                populate: { path: 'repliedToMessage' },
            })
            .lean()) as PopulatedMessageDoc | null;
        return msg ? this.transformMessage(msg) : null;
    }

    public async updateMessage(
        id: string,
        data: Partial<IMessage>,
    ): Promise<IMessage | null> {
        const msg = (await this.messageModel
            .findOneAndUpdate({ snowflakeId: id }, data, {
                returnDocument: 'after',
            })
            .populate({
                path: 'repliedToMessage',
                populate: { path: 'repliedToMessage' },
            })
            .lean()) as PopulatedMessageDoc | null;
        return msg ? this.transformMessage(msg) : null;
    }

    public async setPollVote(
        id: string,
        userId: string,
        optionIds: string[],
    ): Promise<IMessage | null> {
        await this.messageModel.updateOne(
            { snowflakeId: id },
            {
                $pull: { 'poll.options.$[].votes': userId },
            },
        );
        if (optionIds.length > 0) {
            await this.messageModel.updateOne(
                { snowflakeId: id },
                {
                    $addToSet: { 'poll.options.$[opt].votes': userId },
                },
                { arrayFilters: [{ 'opt.id': { $in: optionIds } }] },
            );
        }
        return this.findById(id);
    }

    public async delete(id: string): Promise<boolean> {
        const result = await this.messageModel.deleteOne({
            snowflakeId: id,
        });
        return result.deletedCount > 0;
    }

    public async updateManyBySenderId(
        senderId: string,
        update: {
            senderDeleted?: boolean;
            anonymizedSender?: string;
        },
    ): Promise<{ modifiedCount: number }> {
        const result = await this.messageModel.updateMany(
            { senderId },
            { $set: update },
        );
        return { modifiedCount: result.modifiedCount };
    }

    public async updateManyByReceiverId(
        receiverId: string,
        update: { receiverDeleted?: boolean; anonymizedReceiver?: string },
    ): Promise<{ modifiedCount: number }> {
        const result = await this.messageModel.updateMany(
            { receiverId },
            update,
        );
        return { modifiedCount: result.modifiedCount };
    }

    public async count(): Promise<number> {
        return await this.messageModel.countDocuments();
    }

    public async countCreatedAfter(date: Date): Promise<number> {
        return await this.messageModel.countDocuments({
            createdAt: { $gt: date },
        });
    }

    public async countByHour(since: Date, hours: number): Promise<number[]> {
        const msPerHour = 1000 * 60 * 60;
        const buckets = await this.messageModel.aggregate<{
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
        const buckets = await this.messageModel.aggregate<{
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
        const oldestMessage = await this.messageModel
            .findOne()
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
