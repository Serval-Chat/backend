import type { Types } from 'mongoose';

// Message interface (domain model)
//
// Represents a direct message between two users
export interface IMessage {
    _id: Types.ObjectId | string;
    senderId: Types.ObjectId | string;
    receiverId: Types.ObjectId | string;
    text: string;
    createdAt?: Date;
    replyToId?: string;
    repliedToMessageId?: Types.ObjectId;
    editedAt?: Date;
    isEdited?: boolean;
    // Flag indicating if the sender has "deleted" the message from their view
    senderDeleted?: boolean;
    // Anonymized sender name used when the sender's account is hard-deleted
    anonymizedSender?: string;
    // Flag indicating if the receiver has "deleted" the message from their view
    receiverDeleted?: boolean;
    // Anonymized receiver name used when the receiver's account is hard-deleted
    anonymizedReceiver?: string;
}

// Message Repository Interface
//
// Encapsulates all direct message-related database operations
export interface IMessageRepository {
    // Find message by ID
    findById(id: string): Promise<IMessage | null>;

    // Find messages between two users
    findByConversation(
        user1Id: string,
        user2Id: string,
        limit?: number,
        before?: string,
        around?: string,
    ): Promise<IMessage[]>;

    // Create a new message
    create(data: {
        senderId: string;
        receiverId: string;
        text: string;
        replyToId?: string;
    }): Promise<IMessage>;

    // Update message (for editing)
    update(id: string, text: string): Promise<IMessage | null>;

    // Delete message by ID
    delete(id: string): Promise<boolean>;

    // Update many messages sent by a user (for hard delete - anonymize)
    updateManyBySenderId(
        senderId: string,
        update: {
            senderDeleted?: boolean;
            anonymizedSender?: string;
        },
    ): Promise<{ modifiedCount: number }>;

    // Update many messages received by a user (for hard delete - anonymize)
    updateManyByReceiverId(
        receiverId: string,
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
