import type { IMessage } from '@/di/interfaces/IMessageRepository';
import type { IServerMessage } from '@/di/interfaces/IServerMessageRepository';
import type { IEmbed } from '@/models/Embed';

export interface DmSearchHit {
    id: string;
    senderId: string;
    receiverId: string;
    text: string;
    highlight?: string;
    createdAt: string;
    embeds: IEmbed[];
    isWebhook: boolean;
    webhookUsername?: string;
    webhookAvatarUrl?: string;
    stickerId?: string;
}

export interface ChannelSearchHit {
    id: string;
    senderId: string;
    channelId: string;
    serverId: string;
    text: string;
    highlight?: string;
    createdAt: string;
    embeds: IEmbed[];
    isWebhook: boolean;
    webhookUsername?: string;
    webhookAvatarUrl?: string;
    stickerId?: string;
}

/** Filters resolved and ready to pass to the ES query builder. */
export interface SearchFilters {
    fromUserId?: string;
    mentionsUserId?: string;
    authorType?: 'user' | 'bot' | 'webhook';
    isPinned?: boolean;
    hasFile?: boolean;
    hasEmbed?: boolean;
    hasLink?: boolean;
    before?: string;
    after?: string;
    strict?: string;
    // negated variants
    notFromUserId?: string;
    notMentionsUserId?: string;
    notAuthorType?: 'user' | 'bot' | 'webhook';
    notIsPinned?: boolean;
    notHasFile?: boolean;
    notHasEmbed?: boolean;
    notHasLink?: boolean;
    notStrict?: string;
}

export interface IMessageSearchService {
    ensureDmIndex(): Promise<void>;
    ensureChannelIndex(): Promise<void>;
    indexDmMessage(msg: IMessage, senderIsBot?: boolean): Promise<void>;
    indexChannelMessage(
        msg: IServerMessage,
        senderIsBot?: boolean,
    ): Promise<void>;
    updateChannelMessageFlags(
        id: string,
        flags: { isPinned?: boolean; isSticky?: boolean },
    ): Promise<void>;
    removeDmMessage(id: string): Promise<void>;
    removeChannelMessage(id: string): Promise<void>;
    searchDmMessages(
        userId: string,
        otherUserId: string,
        query: string,
        limit: number,
        offset: number,
        filters?: SearchFilters,
    ): Promise<{ hits: DmSearchHit[]; total: number }>;
    searchChannelMessages(
        channelId: string | string[],
        query: string,
        limit: number,
        offset: number,
        filters?: SearchFilters,
    ): Promise<{ hits: ChannelSearchHit[]; total: number }>;
}
