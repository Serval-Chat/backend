import { Injectable } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import {
    IMessageRepository,
    IMessage,
} from '@/di/interfaces/IMessageRepository';
import { Message } from '@/models/Message';
import { injectable } from 'inversify';

// Mongoose Message repository
//
// Implements IMessageRepository using Mongoose Message model
// Encapsulates all direct message operations
@injectable()
@Injectable()
export class MongooseMessageRepository implements IMessageRepository {
    private messageModel = Message;
    constructor() { }

    async findById(id: string): Promise<IMessage | null> {
        return await this.messageModel.findById(id).lean();
    }

    // Find messages between two users with pagination
    //
    // Supports:
    // - 'Before': Older messages before a specific ID or date
    // - 'Around': Contextual messages around a specific message (split limit)
    async findByConversation(
        user1Id: string,
        user2Id: string,
        limit = 50,
        before?: string,
        around?: string,
    ): Promise<IMessage[]> {
        const baseQuery: any = {
            $or: [
                { senderId: user1Id, receiverId: user2Id },
                { senderId: user2Id, receiverId: user1Id },
            ],
        };

        if (around) {
            // Fetch context around a specific message
            const targetMessage = await this.messageModel.findById(around);
            if (!targetMessage) return [];

            const targetDate = targetMessage.createdAt;

            // Fetch messages before (older)
            const beforeQuery = {
                ...baseQuery,
                createdAt: { $lt: targetDate },
            };
            const beforeMessages = await this.messageModel.find(beforeQuery)
                .sort({ createdAt: -1 })
                .limit(Math.floor(limit / 2))
                .populate('repliedToMessageId')
                .lean();

            // Fetch messages after (newer)
            const afterQuery = {
                ...baseQuery,
                createdAt: { $gte: targetDate },
            };
            const afterMessages = await this.messageModel.find(afterQuery)
                .sort({ createdAt: 1 }) // Ascending to get closest to target
                .limit(Math.ceil(limit / 2))
                .populate('repliedToMessageId')
                .lean();

            // Combine and sort ascending
            return [...beforeMessages, ...afterMessages].sort(
                (a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0),
            );
        }

        const query = { ...baseQuery };

        if (before) {
            // Check if 'before' is a valid ObjectId (24 hex characters)
            const isValidObjectId = /^[a-f\d]{24}$/i.test(before);

            if (isValidObjectId) {
                // Use _id comparison for ObjectId-based pagination
                query._id = { $lt: before };
            } else {
                // Fall back to date-based comparison for timestamp strings
                query.createdAt = { $lt: new Date(before) };
            }
        }

        const messages = await this.messageModel.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('repliedToMessageId')
            .lean();

        return messages.reverse();
    }

    async create(data: {
        senderId: string;
        receiverId: string;
        text: string;
        replyToId?: string;
        repliedToMessageId?: Types.ObjectId;
    }): Promise<IMessage> {
        const message = new this.messageModel(data);
        return await message.save();
    }

    async update(id: string, text: string): Promise<IMessage | null> {
        return await this.messageModel.findByIdAndUpdate(
            id,
            {
                text,
                editedAt: new Date(),
                isEdited: true,
            },
            { new: true },
        ).lean();
    }

    async delete(id: string): Promise<boolean> {
        const result = await this.messageModel.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async updateManyBySenderId(
        senderId: string,
        update: {
            senderDeleted?: boolean;
            anonymizedSender?: string;
        },
    ): Promise<{ modifiedCount: number }> {
        const result = await this.messageModel.updateMany({ senderId }, { $set: update });
        return { modifiedCount: result.modifiedCount };
    }

    async updateManyByReceiverId(
        receiverId: string,
        update: { receiverDeleted?: boolean; anonymizedReceiver?: string },
    ): Promise<{ modifiedCount: number }> {
        const result = await this.messageModel.updateMany({ receiverId }, update);
        return { modifiedCount: result.modifiedCount };
    }

    async count(): Promise<number> {
        return await this.messageModel.countDocuments();
    }

    async countCreatedAfter(date: Date): Promise<number> {
        return await this.messageModel.countDocuments({ createdAt: { $gt: date } });
    }
}

