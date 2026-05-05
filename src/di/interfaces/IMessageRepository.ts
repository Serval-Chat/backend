import type { Types, ClientSession } from 'mongoose';

// Message interface (domain model)
//
// Represents a direct message between two users
export interface IMessage {
    _id: Types.ObjectId;
    senderId: Types.ObjectId;
    receiverId: Types.ObjectId;
    text: string;
    createdAt?: Date;
    replyToId?: Types.ObjectId;
    repliedToMessageId?: Types.ObjectId;
    referenced_message?: IMessage;
    stickerId?: Types.ObjectId;
    editedAt?: Date;
    isEdited?: boolean;
    senderDeleted?: boolean;
    anonymizedSender?: string;
    receiverDeleted?: boolean;
    anonymizedReceiver?: string;
}

// Message Repository Interface
//
// Encapsulates all direct message-related database operations
export interface IMessageRepository {
    findById(id: Types.ObjectId): Promise<IMessage | null>;

    findByConversation(
        user1Id: Types.ObjectId,
        user2Id: Types.ObjectId,
        limit?: number,
        before?: string,
        around?: string,
        after?: string,
    ): Promise<IMessage[]>;

    create(
        data: {
            senderId: Types.ObjectId;
            receiverId: Types.ObjectId;
            text?: string;
            replyToId?: Types.ObjectId;
            repliedToMessageId?: Types.ObjectId;
            stickerId?: Types.ObjectId;
        },
        session?: ClientSession,
    ): Promise<IMessage>;

    update(id: Types.ObjectId, text: string): Promise<IMessage | null>;

    delete(id: Types.ObjectId): Promise<boolean>;

    // Update many messages sent by a user (for hard delete - anonymize)
    updateManyBySenderId(
        senderId: Types.ObjectId,
        update: {
            senderDeleted?: boolean;
            anonymizedSender?: string;
        },
    ): Promise<{ modifiedCount: number }>;

    // Update many messages received by a user (for hard delete - anonymize)
    updateManyByReceiverId(
        receiverId: Types.ObjectId,
        update: {
            receiverDeleted?: boolean;
            anonymizedReceiver?: string;
        },
    ): Promise<{ modifiedCount: number }>;

    count(): Promise<number>;

    // Count messages created after a certain date
    countCreatedAfter(date: Date): Promise<number>;

    // Count messages per hour for the last N hours (oldest-first array)
    countByHour(since: Date, hours: number): Promise<number[]>;

    // Count messages per day for the last N days (oldest-first array)
    countByDay(since: Date, days: number): Promise<number[]>;

    // Count all messages per day since the very first message (lifetime view)
    countAllByDay(): Promise<number[]>;
}
