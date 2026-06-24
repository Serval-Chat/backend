import { Client } from '@elastic/elasticsearch';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { Logger, OnModuleInit } from '@nestjs/common';
import { injectable, inject } from 'inversify';
import { ELASTICSEARCH_URL } from '@/config/env';
import { SYSTEM_SENDER_ID } from '@/utils/snowflake';
import { TYPES } from '@/di/types';
import type { IMessage } from '@/di/interfaces/IMessageRepository';
import type { IServerMessage } from '@/di/interfaces/IServerMessageRepository';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import type {
    IMessageSearchService,
    SearchFilters,
    DmSearchHit,
    ChannelSearchHit,
} from '@/di/interfaces/IMessageSearchService';
import type { IEmbed } from '@/models/Embed';

export const DM_MESSAGES_INDEX = 'serchat-dm-messages-v1';
export const CHANNEL_MESSAGES_INDEX = 'serchat-channel-messages-v1';

const CACHE_TTL_SECONDS = 30;

const SHARED_FILTER_FIELDS = {
    is_pinned: { type: 'boolean' },
    is_sticky: { type: 'boolean' },
    is_webhook: { type: 'boolean' },
    is_bot: { type: 'boolean' },
    has_file: { type: 'boolean' },
    has_embed: { type: 'boolean' },
    has_link: { type: 'boolean' },
    mentions: { type: 'keyword' },
    embeds: { type: 'object', enabled: false },
    webhookUsername: { type: 'keyword' },
    webhookAvatarUrl: { type: 'keyword' },
    stickerId: { type: 'keyword' },
} as const;

export const DM_INDEX_MAPPINGS = {
    properties: {
        id: { type: 'keyword' },
        senderId: { type: 'keyword' },
        receiverId: { type: 'keyword' },
        text: { type: 'text', analyzer: 'standard' },
        createdAt: { type: 'date' },
        senderDeleted: { type: 'boolean' },
        receiverDeleted: { type: 'boolean' },
        ...SHARED_FILTER_FIELDS,
    },
} as const;

export const CHANNEL_INDEX_MAPPINGS = {
    properties: {
        id: { type: 'keyword' },
        senderId: { type: 'keyword' },
        channelId: { type: 'keyword' },
        serverId: { type: 'keyword' },
        text: { type: 'text', analyzer: 'standard' },
        createdAt: { type: 'date' },
        isDeleted: { type: 'boolean' },
        ...SHARED_FILTER_FIELDS,
    },
} as const;

const HIGHLIGHT_CONFIG = {
    fields: { text: { number_of_fragments: 1, fragment_size: 150 } },
    pre_tags: ['<mark>'],
    post_tags: ['</mark>'],
    // escape any HTML in the source message text so the highlighted fragment
    // is safe to render as HTML; only our own <mark> tags stay unescaped.
    encoder: 'html' as const,
};

const URL_RE = /https?:\/\/\S+/i;
const MENTION_RE = /<userid:'([a-f0-9]{24})'>/gi;

function extractMentions(text: string): string[] {
    const ids: string[] = [];
    MENTION_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MENTION_RE.exec(text)) !== null) ids.push(m[1] ?? '');
    return ids;
}

function toISOSafe(d: Date | string | undefined): string {
    if (d === undefined || d === '') return new Date().toISOString();
    return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function toOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value !== '' ? value : undefined;
}

@injectable()
export class MessageSearchService
    implements OnModuleInit, IMessageSearchService
{
    private readonly logger = new Logger(MessageSearchService.name);
    private readonly client = new Client({
        node: ELASTICSEARCH_URL,
        requestTimeout: 3000,
        sniffOnStart: false,
    });

    public constructor(
        @inject(TYPES.RedisService)
        private readonly redisService: IRedisService,
    ) {}

    public async onModuleInit(): Promise<void> {
        await Promise.all([
            this.ensureDmIndex(),
            this.ensureChannelIndex(),
        ]).catch((err: unknown) => {
            this.logger.warn(
                `[MessageSearchService] Could not initialise search indexes: ${String(err)}`,
            );
        });
    }

    public async ensureDmIndex(): Promise<void> {
        try {
            const exists = await this.client.indices.exists({
                index: DM_MESSAGES_INDEX,
            });
            if (!exists) {
                await this.client.indices.create({
                    index: DM_MESSAGES_INDEX,
                    mappings: DM_INDEX_MAPPINGS,
                });
                this.logger.log(
                    `[MessageSearchService] Created index ${DM_MESSAGES_INDEX}`,
                );
            }
        } catch (err: unknown) {
            this.logger.warn(
                `[MessageSearchService] ensureDmIndex failed: ${String(err)}`,
            );
        }
    }

    public async ensureChannelIndex(): Promise<void> {
        try {
            const exists = await this.client.indices.exists({
                index: CHANNEL_MESSAGES_INDEX,
            });
            if (!exists) {
                await this.client.indices.create({
                    index: CHANNEL_MESSAGES_INDEX,
                    mappings: CHANNEL_INDEX_MAPPINGS,
                });
                this.logger.log(
                    `[MessageSearchService] Created index ${CHANNEL_MESSAGES_INDEX}`,
                );
            }
        } catch (err: unknown) {
            this.logger.warn(
                `[MessageSearchService] ensureChannelIndex failed: ${String(err)}`,
            );
        }
    }

    public async indexDmMessage(
        msg: IMessage,
        senderIsBot = false,
    ): Promise<void> {
        try {
            const text = msg.text;
            await this.client.index({
                index: DM_MESSAGES_INDEX,
                id: msg.snowflakeId,
                document: {
                    id: msg.snowflakeId,
                    senderId: msg.senderId.toString(),
                    receiverId: msg.receiverId.toString(),
                    text,
                    createdAt: toISOSafe(msg.createdAt),
                    senderDeleted: msg.senderDeleted ?? false,
                    receiverDeleted: msg.receiverDeleted ?? false,
                    is_pinned: false,
                    is_sticky: false,
                    is_webhook: false,
                    is_bot: senderIsBot,
                    has_file: (msg.attachments?.length ?? 0) > 0,
                    has_embed: (msg.embeds?.length ?? 0) > 0,
                    has_link: URL_RE.test(text),
                    mentions: extractMentions(text),
                    embeds: msg.embeds ?? [],
                    webhookUsername: undefined,
                    webhookAvatarUrl: undefined,
                    stickerId: msg.stickerId?.toString(),
                },
                refresh: false,
            });
        } catch (err: unknown) {
            this.logger.error(
                `[MessageSearchService] indexDmMessage failed: ${String(err)}`,
            );
        }
    }

    public async indexChannelMessage(
        msg: IServerMessage,
        senderIsBot = false,
    ): Promise<void> {
        try {
            const text = msg.text;
            await this.client.index({
                index: CHANNEL_MESSAGES_INDEX,
                id: msg.snowflakeId,
                document: {
                    id: msg.snowflakeId,
                    senderId: msg.senderId.toString(),
                    channelId: msg.channelId.toString(),
                    serverId: msg.serverId.toString(),
                    text,
                    createdAt: toISOSafe(msg.createdAt),
                    isDeleted: msg.deletedAt !== undefined,
                    is_pinned: msg.isPinned ?? false,
                    is_sticky: msg.isSticky ?? false,
                    is_webhook:
                        (msg.isWebhook ?? false) ||
                        msg.senderId.toString() === SYSTEM_SENDER_ID,
                    is_bot: senderIsBot,
                    has_file: (msg.attachments?.length ?? 0) > 0,
                    has_embed: (msg.embeds?.length ?? 0) > 0,
                    has_link: URL_RE.test(text),
                    mentions: extractMentions(text),
                    embeds: msg.embeds ?? [],
                    webhookUsername: msg.webhookUsername,
                    webhookAvatarUrl: msg.webhookAvatarUrl,
                    stickerId: msg.stickerId?.toString(),
                },
                refresh: false,
            });
        } catch (err: unknown) {
            this.logger.error(
                `[MessageSearchService] indexChannelMessage failed: ${String(err)}`,
            );
        }
    }

    public async updateChannelMessageFlags(
        id: string,
        flags: { isPinned?: boolean; isSticky?: boolean },
    ): Promise<void> {
        const doc: Record<string, boolean> = {};
        if (flags.isPinned !== undefined) doc.is_pinned = flags.isPinned;
        if (flags.isSticky !== undefined) doc.is_sticky = flags.isSticky;
        if (Object.keys(doc).length === 0) return;

        try {
            await this.client.update({
                index: CHANNEL_MESSAGES_INDEX,
                id,
                doc,
            });
        } catch (err: unknown) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404) return;
            this.logger.error(
                `[MessageSearchService] updateChannelMessageFlags failed: ${String(err)}`,
            );
        }
    }

    public async removeDmMessage(id: string): Promise<void> {
        try {
            await this.client.delete({ index: DM_MESSAGES_INDEX, id });
        } catch (err: unknown) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404) return;
            this.logger.error(
                `[MessageSearchService] removeDmMessage failed: ${String(err)}`,
            );
        }
    }

    public async removeChannelMessage(id: string): Promise<void> {
        try {
            await this.client.delete({ index: CHANNEL_MESSAGES_INDEX, id });
        } catch (err: unknown) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404) return;
            this.logger.error(
                `[MessageSearchService] removeChannelMessage failed: ${String(err)}`,
            );
        }
    }

    public async searchDmMessages(
        userId: string,
        otherUserId: string,
        query: string,
        limit: number,
        offset: number,
        filters: SearchFilters = {},
    ): Promise<{ hits: DmSearchHit[]; total: number }> {
        if (!query && !this.hasActiveFilters(filters))
            return { hits: [], total: 0 };

        const cacheKey = this.buildCacheKey(
            'dm',
            [userId, otherUserId, query, String(limit), String(offset)],
            filters,
        );
        const cached = await this.getFromCache<{
            hits: DmSearchHit[];
            total: number;
        }>(cacheKey);
        if (cached !== null) return cached;

        const baseFilter: QueryDslQueryContainer[] = [
            {
                bool: {
                    minimum_should_match: 1,
                    should: [
                        {
                            bool: {
                                must: [
                                    { term: { senderId: userId } },
                                    { term: { receiverId: otherUserId } },
                                    { term: { senderDeleted: false } },
                                ],
                            },
                        },
                        {
                            bool: {
                                must: [
                                    { term: { senderId: otherUserId } },
                                    { term: { receiverId: userId } },
                                    { term: { receiverDeleted: false } },
                                ],
                            },
                        },
                    ],
                },
            },
        ];

        const { must, filter, mustNot } = this.buildMustAndFilter(
            query,
            filters,
            baseFilter,
        );

        const response = await this.client.search({
            index: DM_MESSAGES_INDEX,
            from: offset,
            size: limit,
            sort: [{ createdAt: { order: 'desc' } }],
            highlight: HIGHLIGHT_CONFIG,
            query: { bool: { must, filter, must_not: mustNot } },
        });

        const total =
            typeof response.hits.total === 'number'
                ? response.hits.total
                : (response.hits.total?.value ?? 0);

        const hits: DmSearchHit[] = response.hits.hits.map((hit) => {
            const src = hit._source as Record<string, unknown>;
            return {
                id: String(src.id ?? hit._id),
                senderId: String(src.senderId ?? ''),
                receiverId: String(src.receiverId ?? ''),
                text: String(src.text ?? ''),
                highlight: hit.highlight?.text?.[0],
                createdAt: String(src.createdAt ?? ''),
                embeds: Array.isArray(src.embeds)
                    ? (src.embeds as IEmbed[])
                    : [],
                isWebhook: Boolean(src.is_webhook),
                webhookUsername: toOptionalString(src.webhookUsername),
                webhookAvatarUrl: toOptionalString(src.webhookAvatarUrl),
                stickerId: toOptionalString(src.stickerId),
            };
        });

        const result = { hits, total };
        this.writeToCache(cacheKey, result);
        return result;
    }

    public async searchChannelMessages(
        channelId: string | string[],
        query: string,
        limit: number,
        offset: number,
        filters: SearchFilters = {},
    ): Promise<{ hits: ChannelSearchHit[]; total: number }> {
        if (!query && !this.hasActiveFilters(filters))
            return { hits: [], total: 0 };

        const channelKey = Array.isArray(channelId)
            ? [...channelId].sort().join(',')
            : channelId;
        const cacheKey = this.buildCacheKey(
            'ch',
            [channelKey, query, String(limit), String(offset)],
            filters,
        );
        const cached = await this.getFromCache<{
            hits: ChannelSearchHit[];
            total: number;
        }>(cacheKey);
        if (cached !== null) return cached;

        const channelFilter: QueryDslQueryContainer = Array.isArray(channelId)
            ? { terms: { channelId } }
            : { term: { channelId } };

        const baseFilter: QueryDslQueryContainer[] = [
            channelFilter,
            { term: { isDeleted: false } },
        ];

        const { must, filter, mustNot } = this.buildMustAndFilter(
            query,
            filters,
            baseFilter,
        );

        const response = await this.client.search({
            index: CHANNEL_MESSAGES_INDEX,
            from: offset,
            size: limit,
            sort: [{ createdAt: { order: 'desc' } }],
            highlight: HIGHLIGHT_CONFIG,
            query: { bool: { must, filter, must_not: mustNot } },
        });

        const total =
            typeof response.hits.total === 'number'
                ? response.hits.total
                : (response.hits.total?.value ?? 0);

        const hits: ChannelSearchHit[] = response.hits.hits.map((hit) => {
            const src = hit._source as Record<string, unknown>;
            return {
                id: String(src.id ?? hit._id),
                senderId: String(src.senderId ?? ''),
                channelId: String(src.channelId ?? ''),
                serverId: String(src.serverId ?? ''),
                text: String(src.text ?? ''),
                highlight: hit.highlight?.text?.[0],
                createdAt: String(src.createdAt ?? ''),
                embeds: Array.isArray(src.embeds)
                    ? (src.embeds as IEmbed[])
                    : [],
                isWebhook: Boolean(src.is_webhook),
                webhookUsername: toOptionalString(src.webhookUsername),
                webhookAvatarUrl: toOptionalString(src.webhookAvatarUrl),
                stickerId: toOptionalString(src.stickerId),
            };
        });

        const result = { hits, total };
        this.writeToCache(cacheKey, result);
        return result;
    }

    private buildMustAndFilter(
        query: string,
        filters: SearchFilters,
        baseFilter: QueryDslQueryContainer[],
    ): {
        must: QueryDslQueryContainer[];
        filter: QueryDslQueryContainer[];
        mustNot: QueryDslQueryContainer[];
    } {
        const must: QueryDslQueryContainer[] = [];
        const filter: QueryDslQueryContainer[] = [...baseFilter];
        const mustNot: QueryDslQueryContainer[] = [];

        // text matching: strict phrase match has priority, fuzzy adds alongside it
        if (filters.strict !== undefined && filters.strict !== '') {
            must.push({ match_phrase: { text: filters.strict } });
        }
        if (query) {
            must.push({ match: { text: { query, fuzziness: 'AUTO' } } });
        }
        if (!query && (filters.strict === undefined || filters.strict === '')) {
            must.push({ match_all: {} });
        }

        // positive filters
        if (filters.fromUserId !== undefined && filters.fromUserId !== '') {
            filter.push({ term: { senderId: filters.fromUserId } });
        }
        if (
            filters.mentionsUserId !== undefined &&
            filters.mentionsUserId !== ''
        ) {
            filter.push({ term: { mentions: filters.mentionsUserId } });
        }
        if (filters.authorType === 'webhook') {
            filter.push({ term: { is_webhook: true } });
        } else if (filters.authorType === 'bot') {
            filter.push({ term: { is_bot: true } });
        } else if (filters.authorType === 'user') {
            filter.push({ term: { is_webhook: false } });
            filter.push({ term: { is_bot: false } });
        }
        if (filters.isPinned !== undefined) {
            filter.push({ term: { is_pinned: filters.isPinned } });
        }
        if (filters.hasFile !== undefined) {
            filter.push({ term: { has_file: filters.hasFile } });
        }
        if (filters.hasEmbed !== undefined) {
            filter.push({ term: { has_embed: filters.hasEmbed } });
        }
        if (filters.hasLink !== undefined) {
            filter.push({ term: { has_link: filters.hasLink } });
        }
        if (filters.before !== undefined || filters.after !== undefined) {
            const range: Record<string, string> = {};
            if (filters.before !== undefined && filters.before !== '')
                range.lte = filters.before;
            if (filters.after !== undefined && filters.after !== '')
                range.gte = filters.after;
            filter.push({ range: { createdAt: range } });
        }

        // negated filters
        if (
            filters.notFromUserId !== undefined &&
            filters.notFromUserId !== ''
        ) {
            mustNot.push({ term: { senderId: filters.notFromUserId } });
        }
        if (
            filters.notMentionsUserId !== undefined &&
            filters.notMentionsUserId !== ''
        ) {
            mustNot.push({ term: { mentions: filters.notMentionsUserId } });
        }
        if (filters.notAuthorType === 'webhook') {
            mustNot.push({ term: { is_webhook: true } });
        } else if (filters.notAuthorType === 'bot') {
            mustNot.push({ term: { is_bot: true } });
        } else if (filters.notAuthorType === 'user') {
            // not a regular user = must be a bot or webhook
            filter.push({
                bool: {
                    should: [
                        { term: { is_bot: true } },
                        { term: { is_webhook: true } },
                    ],
                    minimum_should_match: 1,
                },
            });
        }
        if (filters.notIsPinned !== undefined) {
            mustNot.push({ term: { is_pinned: filters.notIsPinned } });
        }
        if (filters.notHasFile !== undefined) {
            mustNot.push({ term: { has_file: filters.notHasFile } });
        }
        if (filters.notHasEmbed !== undefined) {
            mustNot.push({ term: { has_embed: filters.notHasEmbed } });
        }
        if (filters.notHasLink !== undefined) {
            mustNot.push({ term: { has_link: filters.notHasLink } });
        }
        if (filters.notStrict !== undefined && filters.notStrict !== '') {
            mustNot.push({ match_phrase: { text: filters.notStrict } });
        }

        return { must, filter, mustNot };
    }

    private hasActiveFilters(f: SearchFilters): boolean {
        return Object.values(f).some((v) => v !== undefined);
    }

    private buildCacheKey(
        prefix: string,
        parts: string[],
        filters: SearchFilters,
    ): string {
        const filterStr = this.hasActiveFilters(filters)
            ? ':' +
              JSON.stringify(
                  Object.fromEntries(
                      Object.entries(filters)
                          .filter(([, v]) => v !== undefined)
                          .sort(([a], [b]) => a.localeCompare(b)),
                  ),
              )
            : '';
        return `search:${prefix}:${parts.join(':')}${filterStr}`;
    }

    private async getFromCache<T>(key: string): Promise<T | null> {
        try {
            const raw = await this.redisService.getClient().get(key);
            if (raw === null) return null;
            return JSON.parse(raw) as T;
        } catch {
            return null;
        }
    }

    private writeToCache<T>(key: string, value: T): void {
        this.redisService
            .getClient()
            .setex(key, CACHE_TTL_SECONDS, JSON.stringify(value))
            .catch((err: unknown) => {
                this.logger.warn(
                    `[MessageSearchService] Cache write failed for ${key}: ${String(err)}`,
                );
            });
    }
}
