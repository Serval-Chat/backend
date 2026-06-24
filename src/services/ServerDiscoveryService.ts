import { Client } from '@elastic/elasticsearch';
import type { estypes } from '@elastic/elasticsearch';
import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import { injectable } from 'inversify';
import { ELASTICSEARCH_URL } from '@/config/env';
import { TYPES } from '@/di/types';
import type {
    IInvite,
    IInviteRepository,
} from '@/di/interfaces/IInviteRepository';
import type {
    IServer,
    IServerRepository,
} from '@/di/interfaces/IServerRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import { Server } from '@/models/Server';
import { toApiId } from '@/utils/mongooseId';

export const DISCOVERY_INDEX = 'serchat-server-discovery-v1';

const RANDOM_INVITE_CODE_PATTERN = /^[0-9a-fA-F]{8}$/;
const CACHE_TTL_SECONDS = 45;
const CACHE_VERSION_KEY = 'discovery:servers:cache-version';

export interface DiscoveryServerDocument {
    id: string;
    name: string;
    description: string;
    icon?: string;
    banner?: {
        type: 'image' | 'color' | 'gif';
        value: string;
    };
    verified: boolean;
    tags: string[];
    memberCount: number;
    inviteCode: string;
    createdAt: string;
}

export interface DiscoverySearchInput {
    query?: string;
    tags?: string[];
    limit: number;
    cursor?: string;
}

export interface DiscoverySearchResult {
    items: DiscoveryServerDocument[];
    tagFacets: { tag: string; count: number }[];
    nextCursor?: string;
}

export interface DiscoveryStatus {
    eligible: boolean;
    blockers: string[];
    hasValidVanityInvite: boolean;
    vanityInviteCode?: string;
}

export function normalizeDiscoveryTags(tags: string[] = []): string[] {
    const normalized: string[] = [];
    const seen = new Set<string>();

    for (const rawTag of tags) {
        const tag = rawTag.trim().slice(0, 25);
        const key = tag.toLowerCase();
        if (tag === '' || seen.has(key)) continue;
        seen.add(key);
        normalized.push(tag);
        if (normalized.length >= 8) break;
    }

    return normalized;
}

export function getDiscoveryInvitePath(invite: IInvite): string | null {
    const customPath = invite.customPath?.trim();
    if (customPath !== undefined && customPath !== '') return customPath;

    const code = invite.code.trim();
    if (code !== '' && !RANDOM_INVITE_CODE_PATTERN.test(code)) return code;

    return null;
}

export function isValidDiscoveryInvite(invite: IInvite | null): boolean {
    if (invite === null) return false;
    if (getDiscoveryInvitePath(invite) === null) return false;
    if (invite.maxUses !== undefined && invite.maxUses > 0) return false;
    if (invite.expiresAt !== undefined) {
        return false;
    }
    return true;
}

export function getDiscoveryEligibility(
    server: Pick<
        IServer,
        'verified' | 'discoveryEnabled' | 'deletedAt' | 'description' | 'tags'
    > | null,
    invite: IInvite | null,
): DiscoveryStatus {
    const blockers: string[] = [];

    if (server === null) {
        blockers.push('Server not found.');
    } else {
        if (server.deletedAt !== undefined) {
            blockers.push('Deleted servers cannot appear in discovery.');
        }
        if (server.verified !== true) {
            blockers.push('Server must be verified.');
        }
        if (server.discoveryEnabled !== true) {
            blockers.push('Server must opt in to discovery.');
        }
        if (
            server.description === undefined ||
            server.description.trim() === ''
        ) {
            blockers.push('Server must have a description.');
        }
        if (server.tags === undefined || server.tags.length === 0) {
            blockers.push('Server must have at least one tag.');
        }
    }

    const hasValidVanityInvite = isValidDiscoveryInvite(invite);
    if (!hasValidVanityInvite) {
        blockers.push(
            'Server needs a vanity invite with unlimited uses and no expiry.',
        );
    }

    return {
        eligible: blockers.length === 0,
        blockers,
        hasValidVanityInvite,
        vanityInviteCode:
            invite !== null
                ? (getDiscoveryInvitePath(invite) ?? undefined)
                : undefined,
    };
}

export function buildDiscoveryTagFilters(
    tags: string[] = [],
): Record<string, unknown>[] {
    return normalizeDiscoveryTags(tags).map((tag) => ({
        term: { tags: tag },
    }));
}

@injectable()
export class ServerDiscoveryService implements OnModuleInit {
    private readonly logger = new Logger(ServerDiscoveryService.name);
    private reindexingAllServers = false;
    private readonly client = new Client({
        node: ELASTICSEARCH_URL,
        requestTimeout: 3000,
        sniffOnStart: false,
    });

    public constructor(
        @Inject(TYPES.ServerRepository)
        private serverRepo: IServerRepository,
        @Inject(TYPES.InviteRepository)
        private inviteRepo: IInviteRepository,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.RedisService)
        private redisService: IRedisService,
        @Inject(TYPES.ElasticsearchConfig)
        private esConfig: {
            settings: Record<string, unknown>;
            mappings: Record<string, unknown>;
        },
    ) {}

    public async onModuleInit(): Promise<void> {
        const createdIndex = await this.ensureIndex();
        if (createdIndex) {
            await this.reindexPotentialServers();
        }
    }

    private getDiscoveryBanner(
        server: IServer,
    ): DiscoveryServerDocument['banner'] {
        if (server.banner === undefined) return undefined;
        switch (server.banner.type) {
            case 'image':
            case 'color':
            case 'gif':
                return {
                    type: server.banner.type,
                    value: server.banner.value,
                };
            default:
                return undefined;
        }
    }

    public async ensureIndex(): Promise<boolean> {
        try {
            const exists = await this.client.indices.exists({
                index: DISCOVERY_INDEX,
            });
            if (exists) {
                try {
                    const settings = await this.client.indices.getSettings({
                        index: DISCOVERY_INDEX,
                    });
                    const indexSettings =
                        settings[DISCOVERY_INDEX]?.settings?.index;
                    const hasAutocomplete =
                        indexSettings?.analysis?.analyzer?.autocomplete !==
                        undefined;
                    if (!hasAutocomplete) {
                        this.logger.log(
                            `Deleting old index ${DISCOVERY_INDEX} to apply edge_ngram settings...`,
                        );
                        await this.client.indices.delete({
                            index: DISCOVERY_INDEX,
                        });
                    } else {
                        return false;
                    }
                } catch (err) {
                    this.logger.warn(`Failed to verify index settings: ${err}`);
                }
            }

            await this.client.indices.create({
                index: DISCOVERY_INDEX,
                settings: this.esConfig.settings,
                mappings: this.esConfig.mappings,
            });
            try {
                await this.clearSearchCache();
            } catch (error) {
                this.logger.warn(
                    `Failed to invalidate discovery cache after index creation: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
            return true;
        } catch (error) {
            this.logger.warn(
                `Elasticsearch discovery index unavailable: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return false;
        }
    }

    public async refreshServer(serverId: string): Promise<void> {
        const server = await this.serverRepo.findById(serverId, true);
        const invite =
            await this.inviteRepo.findDiscoveryInviteByServerId(serverId);
        const status = getDiscoveryEligibility(server, invite);

        if (!status.eligible || server === null || invite === null) {
            await this.removeServer(serverId);
            return;
        }

        const inviteCode = getDiscoveryInvitePath(invite);
        if (inviteCode === null) {
            await this.removeServer(serverId);
            return;
        }

        const memberCount =
            await this.serverMemberRepo.countByServerId(serverId);

        const document: DiscoveryServerDocument = {
            id: server.id,
            name: server.name,
            description: server.description ?? '',
            icon: server.icon,
            banner: this.getDiscoveryBanner(server),
            verified: server.verified === true,
            tags: normalizeDiscoveryTags(server.tags ?? []),
            memberCount,
            inviteCode,
            createdAt: (server.createdAt ?? new Date()).toISOString(),
        };

        try {
            await this.ensureIndex();
            await this.client.index({
                index: DISCOVERY_INDEX,
                id: document.id,
                document,
                refresh: false,
            });
            await this.clearSearchCache();
        } catch (error) {
            this.logger.warn(
                `Failed to index discovery server ${document.id}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    public async removeServer(serverId: string): Promise<void> {
        try {
            await this.client.delete({
                index: DISCOVERY_INDEX,
                id: serverId,
            });
            await this.clearSearchCache();
        } catch (error) {
            const statusCode = (error as { meta?: { statusCode?: number } })
                .meta?.statusCode;
            if (statusCode !== 404) {
                this.logger.warn(
                    `Failed to remove discovery server ${serverId}: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        }
    }

    public async reindexPotentialServers(): Promise<void> {
        if (this.reindexingAllServers) return;
        this.reindexingAllServers = true;

        try {
            const servers = await Server.find({
                deletedAt: { $exists: false },
                $or: [{ discoveryEnabled: true }, { verified: true }],
            })
                .select('snowflakeId')
                .lean<Array<{ snowflakeId: string }>>();

            await Promise.all(
                servers.map((server) => this.refreshServer(server.snowflakeId)),
            );
        } finally {
            this.reindexingAllServers = false;
        }
    }

    public async getStatus(serverId: string): Promise<DiscoveryStatus> {
        const server = await this.serverRepo.findById(serverId, true);
        const invite =
            await this.inviteRepo.findDiscoveryInviteByServerId(serverId);
        return getDiscoveryEligibility(server, invite);
    }

    public async search(
        input: DiscoverySearchInput,
    ): Promise<DiscoverySearchResult> {
        const normalizedInput = {
            ...input,
            query: input.query?.trim() ?? '',
            tags: normalizeDiscoveryTags(input.tags ?? []),
        };
        const cacheKey = await this.getSearchCacheKey(normalizedInput);
        const cached = await this.redisService.getClient().get(cacheKey);
        if (cached !== null) {
            return JSON.parse(cached) as DiscoverySearchResult;
        }

        let result: DiscoverySearchResult;
        try {
            result = await this.searchElastic(normalizedInput);
        } catch (error) {
            this.logger.warn(
                `Discovery search fell back to MongoDB: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            result = await this.searchMongoFallback(normalizedInput);
        }

        await this.redisService
            .getClient()
            .set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
        return result;
    }

    private async searchElastic(
        input: DiscoverySearchInput,
    ): Promise<DiscoverySearchResult> {
        await this.ensureIndex();
        const searchAfter =
            input.cursor !== undefined
                ? (JSON.parse(
                      Buffer.from(input.cursor, 'base64url').toString('utf8'),
                  ) as estypes.SortResults)
                : undefined;

        const filters = buildDiscoveryTagFilters(input.tags ?? []);

        const queryBody: Record<string, unknown> =
            input.query !== undefined && input.query !== ''
                ? {
                      function_score: {
                          query: {
                              bool: {
                                  should: [
                                      {
                                          multi_match: {
                                              query: input.query,
                                              fields: [
                                                  'name.standard^5',
                                                  'name^2',
                                                  'description',
                                                  'tags^3',
                                              ],
                                              fuzziness: 'AUTO',
                                              type: 'most_fields',
                                          },
                                      },
                                  ],
                              },
                          },
                          functions: [
                              {
                                  filter: { term: { verified: true } },
                                  weight: 1.5,
                              },
                              {
                                  field_value_factor: {
                                      field: 'memberCount',
                                      factor: 1.0,
                                      modifier: 'log1p',
                                      missing: 0,
                                  },
                                  weight: 1.0,
                              },
                          ],
                          score_mode: 'multiply',
                          boost_mode: 'multiply',
                      },
                  }
                : {
                      function_score: {
                          query: { match_all: {} },
                          functions: [
                              {
                                  filter: { term: { verified: true } },
                                  weight: 1.5,
                              },
                              {
                                  field_value_factor: {
                                      field: 'memberCount',
                                      factor: 1.0,
                                      modifier: 'log1p',
                                      missing: 0,
                                  },
                                  weight: 1.0,
                              },
                          ],
                          score_mode: 'multiply',
                          boost_mode: 'multiply',
                      },
                  };

        const response = await this.client.search<DiscoveryServerDocument>({
            index: DISCOVERY_INDEX,
            size: input.limit,
            query: {
                bool: {
                    must: [queryBody],
                    filter: filters,
                },
            },
            aggs: {
                tags: {
                    terms: {
                        field: 'tags',
                        size: 20,
                    },
                },
            },
            sort: [
                { _score: { order: 'desc' } },
                { memberCount: { order: 'desc' } },
                { createdAt: { order: 'desc' } },
                { id: { order: 'asc' } },
            ],
            search_after: searchAfter,
        });

        const hits = response.hits.hits;
        const items = hits
            .map((hit) => hit._source)
            .filter(
                (source): source is DiscoveryServerDocument =>
                    source !== undefined,
            );
        const lastHit = hits[hits.length - 1];
        const nextCursor =
            hits.length === input.limit && lastHit?.sort !== undefined
                ? Buffer.from(JSON.stringify(lastHit.sort)).toString(
                      'base64url',
                  )
                : undefined;
        const buckets =
            (
                response.aggregations?.tags as
                    | { buckets?: { key: string; doc_count: number }[] }
                    | undefined
            )?.buckets ?? [];

        return {
            items,
            tagFacets: buckets.map((bucket) => ({
                tag: bucket.key,
                count: bucket.doc_count,
            })),
            nextCursor,
        };
    }

    private async searchMongoFallback(
        input: DiscoverySearchInput,
    ): Promise<DiscoverySearchResult> {
        const query = input.query?.toLowerCase() ?? '';
        const tagFilters = new Set(
            (input.tags ?? []).map((tag) => tag.toLowerCase()),
        );
        const parsedCursorOffset =
            input.cursor !== undefined
                ? Number(
                      Buffer.from(input.cursor, 'base64url').toString('utf8'),
                  )
                : 0;
        const cursorOffset = Number.isFinite(parsedCursorOffset)
            ? parsedCursorOffset
            : 0;

        const serversRaw: unknown = toApiId(
            await Server.find({
                discoveryEnabled: true,
                verified: true,
                deletedAt: { $exists: false },
            })
                .sort({ createdAt: -1 })
                .lean(),
        );
        const servers = (
            serversRaw as (IServer & { snowflakeId: string })[]
        ).map((server) => ({ ...server, id: server.snowflakeId }));

        const eligible: { doc: DiscoveryServerDocument; score: number }[] = [];
        const facetCounts = new Map<string, number>();

        for (const server of servers) {
            const invite = await this.inviteRepo.findDiscoveryInviteByServerId(
                server.id,
            );
            if (!isValidDiscoveryInvite(invite) || invite === null) continue;
            const inviteCode = getDiscoveryInvitePath(invite);
            if (inviteCode === null) continue;

            const tags = normalizeDiscoveryTags(server.tags ?? []);
            for (const tag of tags) {
                facetCounts.set(tag, (facetCounts.get(tag) ?? 0) + 1);
            }

            const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));
            const matchesTags = [...tagFilters].every((tag) => tagSet.has(tag));
            if (!matchesTags) continue;

            let textScore = 0;
            const nameLower = server.name.toLowerCase();
            const descLower = (server.description ?? '').toLowerCase();

            if (query !== '') {
                const queryWords = query.split(/\s+/).filter(Boolean);
                let matchesQuery = false;

                for (const word of queryWords) {
                    const nameWords = nameLower
                        .split(/[\s'’]+/)
                        .filter(Boolean);
                    const namePrefixMatch = nameWords.some((w) =>
                        w.startsWith(word),
                    );

                    if (
                        namePrefixMatch ||
                        nameLower.includes(word) ||
                        descLower.includes(word) ||
                        tags.some((t) => t.toLowerCase().includes(word))
                    ) {
                        matchesQuery = true;
                        if (namePrefixMatch) textScore += 10;
                        if (nameLower.includes(word)) textScore += 5;
                        if (descLower.includes(word)) textScore += 2;
                        if (tags.some((t) => t.toLowerCase() === word)) {
                            textScore += 4;
                        }
                    }
                }

                if (!matchesQuery) continue;
            } else {
                textScore = 1.0;
            }

            const memberCount = await this.serverMemberRepo.countByServerId(
                server.id,
            );

            const verificationBoost = server.verified === true ? 1.5 : 1.0;
            const memberBoost = Math.log1p(memberCount);
            const score = textScore * verificationBoost * memberBoost;

            eligible.push({
                doc: {
                    id: server.id,
                    name: server.name,
                    description: server.description ?? '',
                    icon: server.icon,
                    banner: this.getDiscoveryBanner(server),
                    verified: server.verified === true,
                    tags,
                    memberCount,
                    inviteCode,
                    createdAt: (server.createdAt ?? new Date()).toISOString(),
                },
                score,
            });
        }

        eligible.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return b.doc.createdAt.localeCompare(a.doc.createdAt);
        });

        const items = eligible
            .map((e) => e.doc)
            .slice(cursorOffset, cursorOffset + input.limit);
        const nextOffset = cursorOffset + items.length;
        const nextCursor =
            nextOffset < eligible.length
                ? Buffer.from(String(nextOffset)).toString('base64url')
                : undefined;

        return {
            items,
            tagFacets: [...facetCounts.entries()]
                .map(([tag, count]) => ({ tag, count }))
                .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
                .slice(0, 20),
            nextCursor,
        };
    }

    private async getSearchCacheKey(
        input: DiscoverySearchInput,
    ): Promise<string> {
        const version =
            (await this.redisService.getClient().get(CACHE_VERSION_KEY)) ?? '0';
        return `discovery:servers:${version}:${JSON.stringify({
            q: input.query ?? '',
            tags: input.tags ?? [],
            limit: input.limit,
            cursor: input.cursor ?? '',
        })}`;
    }

    private async clearSearchCache(): Promise<void> {
        await this.redisService.getClient().incr(CACHE_VERSION_KEY);
    }
}
