import type { Types, ClientSession } from 'mongoose';
import type { IPoll } from '@/models/Message';
import type { IEmbed, IEmbedButton } from '@/models/Embed';
import type { IMessageAttachment } from '@/models/Attachment';

// Message interface (domain model)
//
// Represents a direct message between two users
export interface IMessage {
    _id: Types.ObjectId;
    snowflakeId: string;
    senderId: string;
    receiverId: string;
    text: string;
    createdAt?: Date;
    replyToId?: string;
    repliedToMessageId?: string;
    referenced_message?: IMessage;
    stickerId?: string;
    editedAt?: Date;
    isEdited?: boolean;
    senderDeleted?: boolean;
    anonymizedSender?: string;
    receiverDeleted?: boolean;
    anonymizedReceiver?: string;
    poll?: IPoll;
    embeds?: IEmbed[];
    components?: IEmbedButton[];
    attachments?: IMessageAttachment[];
    noEmbeds?: boolean;
}

// Message Repository Interface
//
// Encapsulates all direct message-related database operations
export interface IMessageRepository {
    findById(id: string): Promise<IMessage | null>;

    findByConversation(
        user1Id: string,
        user2Id: string,
        limit?: number,
        before?: string,
        around?: string,
        after?: string,
    ): Promise<IMessage[]>;

    create(
        data: {
            senderId: string;
            receiverId: string;
            text?: string;
            replyToId?: string;
            repliedToMessageId?: string;
            stickerId?: string;
            poll?: IPoll;
            attachments?: IMessageAttachment[];
            noEmbeds?: boolean;
        },
        session?: ClientSession,
    ): Promise<IMessage>;

    update(id: string, text: string): Promise<IMessage | null>;

    updateMessage(
        id: string,
        data: Partial<IMessage>,
    ): Promise<IMessage | null>;

    // Atomically replaces a user's poll ballot; empty array retracts the vote.
    setPollVote(
        id: string,
        userId: string,
        optionIds: string[],
    ): Promise<IMessage | null>;

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
