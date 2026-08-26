import type { Types, ClientSession } from 'mongoose';
import type { IPoll } from '@/models/Message';
import type { IEmbed, IEmbedButton } from '@/models/Embed';
import type { IMessageAttachment } from '@/models/Attachment';
import type { InteractionValue } from '@/types/interactions';
import type { ReactionData } from './IReactionRepository';

export interface IMessage {
    _id: Types.ObjectId;
    snowflakeId: string;
    channelId: string;
    senderId: string;
    serverId?: string;
    receiverId?: string;
    text: string;
    createdAt?: Date;
    replyToId?: string;
    repliedToMessageId?: string;
    referenced_message?: IMessage;
    reactions?: ReactionData[];
    stickerId?: string;
    editedAt?: Date;
    isEdited?: boolean;
    deletedAt?: Date;
    isPinned?: boolean;
    isSticky?: boolean;
    isWebhook?: boolean;
    webhookUsername?: string;
    webhookAvatarUrl?: string;
    interaction?: {
        command: string;
        options: { name: string; value: InteractionValue }[];
        user: { id: string; username: string };
    };
    senderDeleted?: boolean;
    anonymizedSender?: string;
    receiverDeleted?: boolean;
    anonymizedReceiver?: string;
    poll?: IPoll;
    embeds?: IEmbed[];
    components?: IEmbedButton[];
    attachments?: IMessageAttachment[];
    noEmbeds?: boolean;
    noEmbedsUrls?: string[];
}

export interface IMessageRepository {
    findById(id: string, includeDeleted?: boolean): Promise<IMessage | null>;

    conversationExists(user1Id: string, user2Id: string): Promise<boolean>;

    findByConversation(
        user1Id: string,
        user2Id: string,
        limit?: number,
        before?: string,
        around?: string,
        after?: string,
    ): Promise<IMessage[]>;

    findByChannelId(
        channelId: string,
        limit?: number,
        before?: string,
        around?: string,
        after?: string,
        includeDeleted?: boolean,
    ): Promise<IMessage[]>;

    findCursorByChannelId(channelId: string): AsyncIterable<IMessage>;

    create(
        data: {
            senderId: string;
            channelId: string;
            serverId?: string;
            receiverId?: string;
            text?: string;
            isWebhook?: boolean;
            webhookUsername?: string;
            webhookAvatarUrl?: string;
            replyToId?: string;
            repliedToMessageId?: string;
            stickerId?: string;
            interaction?: {
                command: string;
                options: { name: string; value: InteractionValue }[];
                user: { id: string; username: string };
            };
            poll?: IPoll;
            embeds?: IEmbed[];
            components?: IEmbedButton[];
            attachments?: IMessageAttachment[];
            noEmbeds?: boolean;
            noEmbedsUrls?: string[];
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

    hardDelete(id: string): Promise<boolean>;

    softDelete(id: string): Promise<boolean>;

    bulkSoftDelete(channelId: string, ids: string[]): Promise<number>;

    deleteByServerId(serverId: string): Promise<number>;

    deleteByChannelId(channelId: string): Promise<number>;

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

    countByChannelId(
        channelId: string,
        includeDeleted?: boolean,
    ): Promise<number>;

    countByServerId(serverId: string): Promise<number>;

    findLastByChannelAndUser(
        channelId: string,
        userId: string,
        includeDeleted?: boolean,
    ): Promise<IMessage | null>;

    findPinnedByChannelId(
        channelId: string,
        includeDeleted?: boolean,
    ): Promise<IMessage[]>;

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
