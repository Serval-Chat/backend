import { Injectable } from '@nestjs/common';
import { type FilterQuery, Types, ClientSession } from 'mongoose';
import {
    IMessageRepository,
    IMessage,
} from '@/di/interfaces/IMessageRepository';
import { Message } from '@/models/Message';
import { injectable } from 'inversify';

type PopulatedMessageDoc = Omit<
    IMessage,
    'repliedToMessageId' | 'replyToId'
> & {
    repliedToMessageId?: Types.ObjectId | PopulatedMessageDoc;
    replyToId?: Types.ObjectId;
};

// Mongoose Message repository
@injectable()
@Injectable()
export class MongooseMessageRepository implements IMessageRepository {
    private messageModel = Message;
    constructor() {}

    private transformMessage(msg: PopulatedMessageDoc): IMessage {
        const transformed = { ...msg } as unknown as IMessage;

        if (
            msg.repliedToMessageId &&
            typeof msg.repliedToMessageId === 'object' &&
            !(msg.repliedToMessageId instanceof Types.ObjectId)
        ) {
            const populated = msg.repliedToMessageId as PopulatedMessageDoc;
            transformed.referenced_message = this.transformMessage(populated);
            transformed.repliedToMessageId = populated._id;
        } else {
            transformed.repliedToMessageId = msg.repliedToMessageId as
                | Types.ObjectId
                | undefined;
        }

        return transformed;
    }

    private async transformMessages(
        messages: PopulatedMessageDoc[],
    ): Promise<IMessage[]> {
        const transformed = messages.map((msg) => this.transformMessage(msg));

        const replyToIds = transformed
            .filter((m) => !m.referenced_message && m.replyToId)
            .map((m) => m.replyToId!);

        // Skip legacy replyToId lookup if all messages are modern (populated via repliedToMessageId)
        if (replyToIds.length === 0) return transformed;

        // Legacy replyToId references are only populated one level deep; nested replies within legacy messages will not have referenced_message set.
        const replyDocs = (await this.messageModel
            .find({ _id: { $in: replyToIds } })
            .lean()) as unknown as PopulatedMessageDoc[];
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

    async findById(id: Types.ObjectId): Promise<IMessage | null> {
        const msg = (await this.messageModel
            .findById(id)
            .populate({
                path: 'repliedToMessageId',
                populate: { path: 'repliedToMessageId' },
            })
            .lean()) as unknown as PopulatedMessageDoc | null;
        return msg ? this.transformMessage(msg) : null;
    }

    // Find messages between two users with pagination
    async findByConversation(
        user1Id: Types.ObjectId,
        user2Id: Types.ObjectId,
        limit = 50,
        before?: string,
        around?: string,
        after?: string,
    ): Promise<IMessage[]> {
        const baseQuery: FilterQuery<IMessage> = {
            $or: [
                { senderId: user1Id, receiverId: user2Id },
                { senderId: user2Id, receiverId: user1Id },
            ],
        };

        if (around) {
            // Fetch context around a specific message
            const targetMessage = (await this.messageModel
                .findById(around)
                .lean()) as unknown as PopulatedMessageDoc | null;
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
                    path: 'repliedToMessageId',
                    populate: { path: 'repliedToMessageId' },
                })
                .lean()) as unknown as PopulatedMessageDoc[];

            const afterMessages = (await this.messageModel
                .find({
                    ...baseQuery,
                    createdAt: { $gte: targetDate },
                })
                .sort({ createdAt: 1 }) // Ascending to get closest to target
                .limit(Math.ceil(limit / 2))
                .populate({
                    path: 'repliedToMessageId',
                    populate: { path: 'repliedToMessageId' },
                })
                .lean()) as unknown as PopulatedMessageDoc[];

            // Combine and sort chronologically
            const combined = [...beforeMessages, ...afterMessages].sort(
                (a, b) =>
                    (a.createdAt?.getTime() || 0) -
                    (b.createdAt?.getTime() || 0),
            );
            return await this.transformMessages(combined);
        }

        const query = { ...baseQuery };

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

        const messages = (await this.messageModel
            .find(query)
            .sort({ createdAt: after ? 1 : -1 })
            .limit(limit)
            .populate({
                path: 'repliedToMessageId',
                populate: { path: 'repliedToMessageId' },
            })
            .lean()) as unknown as PopulatedMessageDoc[];

        if (!after) {
            messages.reverse();
        }

        return await this.transformMessages(messages);
    }

    async create(
        data: {
            senderId: Types.ObjectId;
            receiverId: Types.ObjectId;
            text: string;
            replyToId?: Types.ObjectId;
            repliedToMessageId?: Types.ObjectId;
        },
        session?: ClientSession,
    ): Promise<IMessage> {
        const createData = {
            ...data,
            senderId: new Types.ObjectId(data.senderId),
            receiverId: new Types.ObjectId(data.receiverId),
            replyToId: data.replyToId
                ? new Types.ObjectId(data.replyToId)
                : undefined,
            repliedToMessageId: data.repliedToMessageId
                ? new Types.ObjectId(data.repliedToMessageId)
                : undefined,
        };
        const message = new this.messageModel(createData);
        const savedMessage = await message.save({ session });
        const msgObj = savedMessage.toObject();
        return this.transformMessage(msgObj);
    }

    async update(id: Types.ObjectId, text: string): Promise<IMessage | null> {
        const msg = (await this.messageModel
            .findByIdAndUpdate(
                id,
                {
                    text,
                    editedAt: new Date(),
                    isEdited: true,
                },
                { new: true },
            )
            .populate({
                path: 'repliedToMessageId',
                populate: { path: 'repliedToMessageId' },
            })
            .lean()) as unknown as PopulatedMessageDoc | null;
        return msg ? this.transformMessage(msg) : null;
    }

    async delete(id: Types.ObjectId): Promise<boolean> {
        const result = await this.messageModel.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async updateManyBySenderId(
        senderId: Types.ObjectId,
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

    async updateManyByReceiverId(
        receiverId: Types.ObjectId,
        update: { receiverDeleted?: boolean; anonymizedReceiver?: string },
    ): Promise<{ modifiedCount: number }> {
        const result = await this.messageModel.updateMany(
            { receiverId },
            update,
        );
        return { modifiedCount: result.modifiedCount };
    }

    async count(): Promise<number> {
        return await this.messageModel.countDocuments();
    }

    async countCreatedAfter(date: Date): Promise<number> {
        return await this.messageModel.countDocuments({
            createdAt: { $gt: date },
        });
    }
}
