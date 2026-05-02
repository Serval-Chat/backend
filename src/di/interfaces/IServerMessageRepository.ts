import type { Types, ClientSession } from 'mongoose';
import type { IEmbed } from '@/models/Embed';
import type { InteractionValue } from '@/types/interactions';
import type { ReactionData } from './IReactionRepository';



// Server Message interface (domain model)
//
// Represents a message sent within a server channel
export interface IServerMessage {
    _id: Types.ObjectId;
    serverId: Types.ObjectId;
    channelId: Types.ObjectId;
    senderId: Types.ObjectId;
    text: string;
    createdAt: Date;
    replyToId?: Types.ObjectId;
    repliedToMessageId?: Types.ObjectId;
    referenced_message?: IServerMessage;
    editedAt?: Date;
    isEdited?: boolean;
    isPinned?: boolean;
    isSticky?: boolean;
    deletedAt?: Date;
    isWebhook?: boolean;
    webhookUsername?: string;
    webhookAvatarUrl?: string;
    embeds?: IEmbed[];
    reactions?: ReactionData[];
    interaction?: {
        command: string;
        options: { name: string; value: InteractionValue }[];
        user: { id: string; username: string };
    };
}

// Server Message Repository Interface
//
// Encapsulates server message operations
export interface IServerMessageRepository {
    create(
        data: {
            serverId: string | Types.ObjectId;
            channelId: string | Types.ObjectId;
            senderId: string | Types.ObjectId;
            text: string;
            isWebhook?: boolean;
            webhookUsername?: string;
            webhookAvatarUrl?: string;
            replyToId?: string | Types.ObjectId;
            repliedToMessageId?: Types.ObjectId;
            embeds?: IEmbed[];
            interaction?: {
                command: string;
                options: { name: string; value: InteractionValue }[];
                user: { id: string; username: string };
            };
        },
        session?: ClientSession,
    ): Promise<IServerMessage>;

    delete(id: Types.ObjectId): Promise<boolean>;

    deleteByServerId(serverId: Types.ObjectId): Promise<number>;

    deleteByChannelId(channelId: Types.ObjectId): Promise<number>;
    
    bulkDelete(channelId: Types.ObjectId, ids: Types.ObjectId[]): Promise<number>;

    findById(
        id: Types.ObjectId,
        includeDeleted?: boolean,
    ): Promise<IServerMessage | null>;

    update(
        id: Types.ObjectId,
        data: Partial<IServerMessage>,
    ): Promise<IServerMessage | null>;

    findByChannelId(
        channelId: Types.ObjectId,
        limit?: number,
        before?: string,
        around?: string,
        after?: string,
        includeDeleted?: boolean,
    ): Promise<IServerMessage[]>;

    findCursorByChannelId(
        channelId: Types.ObjectId,
    ): AsyncIterable<IServerMessage>;

    countByChannelId(
        channelId: Types.ObjectId,
        includeDeleted?: boolean,
    ): Promise<number>;

    countByServerId(serverId: Types.ObjectId): Promise<number>;

    findLastByChannelAndUser(
        channelId: Types.ObjectId,
        userId: Types.ObjectId,
        includeDeleted?: boolean,
    ): Promise<IServerMessage | null>;
    findPinnedByChannelId(
        channelId: Types.ObjectId,
        includeDeleted?: boolean,
    ): Promise<IServerMessage[]>;

    count(): Promise<number>;

    // Count messages created after a certain date
    countCreatedAfter(date: Date): Promise<number>;

    // Count server messages per hour for the last N hours (oldest-first array)
    countByHour(since: Date, hours: number): Promise<number[]>;

    // Count server messages per day for the last N days (oldest-first array)
    countByDay(since: Date, days: number): Promise<number[]>;

    // Count all server messages per day since the very first message (lifetime view)
    countAllByDay(): Promise<number[]>;
}
