import type { Types, ClientSession } from 'mongoose';
import type { IEmbed, IEmbedButton } from '@/models/Embed';
import type { InteractionValue } from '@/types/interactions';
import type { ReactionData } from './IReactionRepository';
import type { IPoll } from '@/models/Message';
import type { IMessageAttachment } from '@/models/Attachment';

// Server Message interface (domain model)
//
// Represents a message sent within a server channel
export interface IServerMessage {
    _id: Types.ObjectId;
    snowflakeId: string;
    serverId: string;
    channelId: string;
    senderId: string;
    text: string;
    createdAt: Date;
    replyToId?: string;
    repliedToMessageId?: string;
    referenced_message?: IServerMessage;
    stickerId?: string;
    editedAt?: Date;
    isEdited?: boolean;
    isPinned?: boolean;
    isSticky?: boolean;
    deletedAt?: Date;
    isWebhook?: boolean;
    webhookUsername?: string;
    webhookAvatarUrl?: string;
    embeds?: IEmbed[];
    components?: IEmbedButton[];
    attachments?: IMessageAttachment[];
    reactions?: ReactionData[];
    interaction?: {
        command: string;
        options: { name: string; value: InteractionValue }[];
        user: { id: string; username: string };
    };
    poll?: IPoll;
    noEmbeds?: boolean;
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
            replyToId?: string;
            repliedToMessageId?: string;
            embeds?: IEmbed[];
            components?: IEmbedButton[];
            attachments?: IMessageAttachment[];
            stickerId?: string;
            interaction?: {
                command: string;
                options: { name: string; value: InteractionValue }[];
                user: { id: string; username: string };
            };
            poll?: IPoll;
            noEmbeds?: boolean;
        },
        session?: ClientSession,
    ): Promise<IServerMessage>;

    delete(id: string): Promise<boolean>;

    deleteByServerId(serverId: string): Promise<number>;

    deleteByChannelId(channelId: string): Promise<number>;

    bulkDelete(channelId: string, ids: string[]): Promise<number>;

    findById(
        id: string,
        includeDeleted?: boolean,
    ): Promise<IServerMessage | null>;

    update(
        id: string,
        data: Partial<IServerMessage>,
    ): Promise<IServerMessage | null>;

    findByChannelId(
        channelId: string,
        limit?: number,
        before?: string,
        around?: string,
        after?: string,
        includeDeleted?: boolean,
    ): Promise<IServerMessage[]>;

    findCursorByChannelId(channelId: string): AsyncIterable<IServerMessage>;

    countByChannelId(
        channelId: string,
        includeDeleted?: boolean,
    ): Promise<number>;

    countByServerId(serverId: string): Promise<number>;

    findLastByChannelAndUser(
        channelId: string,
        userId: string,
        includeDeleted?: boolean,
    ): Promise<IServerMessage | null>;
    findPinnedByChannelId(
        channelId: string,
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
