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
    // Find message by ID
    findById(id: Types.ObjectId): Promise<IMessage | null>;

    // Find messages between two users
    findByConversation(
        user1Id: Types.ObjectId,
        user2Id: Types.ObjectId,
        limit?: number,
        before?: string,
        around?: string,
        after?: string,
    ): Promise<IMessage[]>;

    // Create a new message
    create(
        data: {
            senderId: Types.ObjectId;
            receiverId: Types.ObjectId;
            text: string;
            replyToId?: Types.ObjectId;
            repliedToMessageId?: Types.ObjectId;
        },
        session?: ClientSession,
    ): Promise<IMessage>;

    // Update message (for editing)
    update(id: Types.ObjectId, text: string): Promise<IMessage | null>;

    // Delete message by ID
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

    // Count total messages
    count(): Promise<number>;

    // Count messages created after a certain date
    countCreatedAfter(date: Date): Promise<number>;
}
