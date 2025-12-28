import { injectable } from 'inversify';
import { Types } from 'mongoose';
import {
    IMessageRepository,
    IMessage,
} from '@/di/interfaces/IMessageRepository';
import { Message } from '@/models/Message';

/**
 * Mongoose Message Repository
 *
 * Implements IMessageRepository using Mongoose Message model.
 * Encapsulates all direct message operations.
 */
@injectable()
export class MongooseMessageRepository implements IMessageRepository {
    async findById(id: string): Promise<IMessage | null> {
        return await Message.findById(id).lean();
    }

    /**
     * Find messages between two users with pagination.
     *
     * Supports:
     * - 'before': Older messages before a specific ID or date.
     * - 'around': Contextual messages around a specific message (split limit).
     */
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
            const targetMessage = await Message.findById(around);
            if (!targetMessage) return [];

            const targetDate = targetMessage.createdAt;

            // Fetch messages before (older)
            const beforeQuery = {
                ...baseQuery,
                createdAt: { $lt: targetDate },
            };
            const beforeMessages = await Message.find(beforeQuery)
                .sort({ createdAt: -1 })
                .limit(Math.floor(limit / 2))
                .populate('repliedToMessageId')
                .lean();

            // Fetch messages after (newer)
            const afterQuery = {
                ...baseQuery,
                createdAt: { $gte: targetDate },
            };
            const afterMessages = await Message.find(afterQuery)
                .sort({ createdAt: 1 }) // Ascending to get closest to target
                .limit(Math.ceil(limit / 2))
                .populate('repliedToMessageId')
                .lean();

            // Combine and sort ascending
            return [...beforeMessages, ...afterMessages].sort(
                (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
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

        const messages = await Message.find(query)
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
        const message = new Message(data);
        return await message.save();
    }

    async update(id: string, text: string): Promise<IMessage | null> {
        return await Message.findByIdAndUpdate(
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
        const result = await Message.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async updateManyBySenderId(
        senderId: string,
        update: {
            senderDeleted?: boolean;
            anonymizedSender?: string;
        },
    ): Promise<{ modifiedCount: number }> {
        const result = await Message.updateMany({ senderId }, { $set: update });
        return { modifiedCount: result.modifiedCount };
    }

    async updateManyByReceiverId(
        receiverId: string,
        update: { receiverDeleted?: boolean; anonymizedReceiver?: string },
    ): Promise<{ modifiedCount: number }> {
        return await Message.updateMany({ receiverId }, update);
    }

    async count(): Promise<number> {
        return await Message.countDocuments();
    }

    async countCreatedAfter(date: Date): Promise<number> {
        return await Message.countDocuments({ createdAt: { $gt: date } });
    }
}
