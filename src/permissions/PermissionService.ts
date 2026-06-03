import { injectable, inject } from 'inversify';
import { Inject } from '@nestjs/common';
import { Types } from 'mongoose';
import { TYPES } from '@/di/types';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IServerMember } from '@/di/interfaces/IServerMemberRepository';
import type { IRoleRepository, IRole } from '@/di/interfaces/IRoleRepository';
import type {
    ICategoryRepository,
    ICategory,
} from '@/di/interfaces/ICategoryRepository';
import type {
    IChannelRepository,
    IChannel,
} from '@/di/interfaces/IChannelRepository';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import { ILogger } from '@/di/interfaces/ILogger';
import { PermissionResolver } from '@/permissions/PermissionResolver';
import type {
    Permissions,
    PermissionKey,
    ServerData,
    ServerRole,
    Channel as ResolverChannel,
    Category as ResolverCategory,
    ServerMember as ResolverMember,
} from '@/permissions/types';
import { PERMISSION_KEYS } from '@/permissions/types';
import { getDocumentId, getDocumentIdString } from '@/utils/mongooseId';

type PermissionOverrideSource =
    | Map<string, unknown>
    | Record<string, unknown>
    | undefined;

const LEGACY_PERMISSION_ALIASES: Partial<Record<string, PermissionKey>> = {
    export_channel_messages: 'exportChannelMessages',
};

function remapEveryoneOverrideKey(
    overrides: Map<string, Permissions> | undefined,
    everyoneRoleId: string | undefined,
): Map<string, Permissions> | undefined {
    if (
        overrides === undefined ||
        everyoneRoleId === undefined ||
        everyoneRoleId === ''
    )
        return overrides;

    const everyoneOverride = overrides.get('everyone');
    if (!everyoneOverride) return overrides;

    const next = new Map(overrides);
    next.delete('everyone');

    // If both keys exist, prefer explicit role id entry.
    if (!next.has(everyoneRoleId)) {
        next.set(everyoneRoleId, everyoneOverride);
    }

    return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
}

function extractPermissionsObject(value: unknown): Permissions {
    if (!isRecord(value)) return {};

    const out: Permissions = {};
    for (const [k, v] of Object.entries(value)) {
        if (isBoolean(v)) {
            const key = LEGACY_PERMISSION_ALIASES[k] ?? k;
            (out as Record<string, boolean>)[key] = v;
        }
    }
    return out;
}

function extractOverridesToMap(
    source: PermissionOverrideSource,
): Map<string, Permissions> | undefined {
    if (!source) return undefined;

    const map = new Map<string, Permissions>();
    if (source instanceof Map) {
        for (const [roleId, perms] of source.entries()) {
            map.set(roleId, extractPermissionsObject(perms));
        }
        return map;
    }

    if (isRecord(source)) {
        for (const [roleId, perms] of Object.entries(source)) {
            map.set(roleId, extractPermissionsObject(perms));
        }
        return map;
    }

    return undefined;
}

interface CachedResolver {
    resolver: PermissionResolver;
    expiresAt: number;
}

const PERMISSION_INVALIDATION_CHANNEL = 'SERCHAT_PERMISSION_INVALIDATE';

@injectable()
export class PermissionService {
    private readonly resolverCache = new Map<string, CachedResolver>();

    private readonly cacheTtlMs: number;
    private readonly instanceId = Math.random().toString(36).slice(2);

    public constructor(
        @inject(TYPES.ServerRepository)
        @Inject(TYPES.ServerRepository)
        private serverRepo: IServerRepository,
        @inject(TYPES.ServerMemberRepository)
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.RoleRepository)
        @Inject(TYPES.RoleRepository)
        private roleRepo: IRoleRepository,
        @inject(TYPES.CategoryRepository)
        @Inject(TYPES.CategoryRepository)
        private categoryRepo: ICategoryRepository,
        @inject(TYPES.ChannelRepository)
        @Inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @inject(TYPES.RedisService)
        @Inject(TYPES.RedisService)
        private redisService?: IRedisService,
    ) {
        this.cacheTtlMs = 1 * 60 * 1000;
        this.subscribeToInvalidations();
    }

    public invalidateCache(serverId: Types.ObjectId): void {
        const serverIdStr = serverId.toString();
        this.invalidateLocal(serverIdStr);
        this.publishInvalidation(serverIdStr);
    }

    private invalidateLocal(serverId: string): void {
        this.resolverCache.delete(serverId);
    }

    private subscribeToInvalidations(): void {
        const subscriber = this.redisService?.getSubscriber();
        if (subscriber === undefined) return;

        void subscriber.subscribe(PERMISSION_INVALIDATION_CHANNEL);
        subscriber.on('message', (channel, message) => {
            if (channel !== PERMISSION_INVALIDATION_CHANNEL) return;

            try {
                const payload = JSON.parse(message) as {
                    serverId?: unknown;
                    origin?: unknown;
                };
                if (
                    payload.origin === this.instanceId ||
                    typeof payload.serverId !== 'string'
                ) {
                    return;
                }
                this.invalidateLocal(payload.serverId);
            } catch (err) {
                this.logger.warn(
                    '[PermissionService] Failed to process permission cache invalidation',
                    { error: err instanceof Error ? err.message : String(err) },
                );
            }
        });
    }

    private publishInvalidation(serverId: string): void {
        const publisher = this.redisService?.getPublisher();
        if (publisher === undefined) return;

        publisher
            .publish(
                PERMISSION_INVALIDATION_CHANNEL,
                JSON.stringify({ serverId, origin: this.instanceId }),
            )
            .catch((err) =>
                this.logger.warn(
                    '[PermissionService] Failed to publish permission cache invalidation',
                    err,
                ),
            );
    }

    public async getHighestRolePosition(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
    ): Promise<number> {
        const resolver = await this.getResolver(serverId);
        if (!resolver) return -1;
        return resolver.getHighestRolePosition(userId.toString());
    }

    public async normalizePermissionMap(
        serverId: Types.ObjectId,
        permissions: Record<string, Record<string, boolean>> | undefined,
    ): Promise<Record<string, Record<string, boolean>>> {
        if (!permissions) return {};

        const everyoneRole = await this.roleRepo.findEveryoneRole(serverId);
        if (!everyoneRole) return permissions;

        const everyoneRoleId = getDocumentIdString(everyoneRole);
        const normalized: Record<string, Record<string, boolean>> = {};

        const everyoneOverride = permissions['everyone'];
        if (everyoneOverride) {
            normalized[everyoneRoleId] = { ...everyoneOverride };
        }

        for (const [id, perms] of Object.entries(permissions)) {
            if (id === 'everyone') continue;
            normalized[id] = { ...perms };
        }

        return normalized;
    }

    public async hasPermission(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
        permission: PermissionKey,
    ): Promise<boolean> {
        const resolver = await this.getResolver(serverId);
        if (!resolver) return false;
        return resolver.hasServerPermission(userId.toString(), permission);
    }

    public async getAllServerPermissions(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
    ): Promise<Permissions> {
        const resolver = await this.getResolver(serverId);
        if (!resolver) return {};

        const perms: Permissions = {};
        for (const key of PERMISSION_KEYS) {
            perms[key] = resolver.hasServerPermission(userId.toString(), key);
        }
        return perms;
    }

    public async hasChannelPermission(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
        channelId: Types.ObjectId,
        permission: PermissionKey,
    ): Promise<boolean> {
        const resolver = await this.getResolver(serverId);
        if (!resolver) return false;
        const result = resolver.canUserDo(
            userId.toString(),
            channelId.toString(),
            permission,
        );
        return result;
    }

    public async hasChannelPermissions(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
        channelIds: Types.ObjectId[],
        permission: PermissionKey,
    ): Promise<Map<string, boolean>> {
        const resolver = await this.getResolver(serverId);
        if (!resolver) {
            return new Map(channelIds.map((id) => [id.toString(), false]));
        }
        return resolver.canUserDoMultiple(
            userId.toString(),
            channelIds.map((id) => id.toString()),
            permission,
        );
    }

    public async hasCategoryPermissions(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
        categoryIds: Types.ObjectId[],
        permission: PermissionKey,
    ): Promise<Map<string, boolean>> {
        const resolver = await this.getResolver(serverId);
        if (!resolver) {
            return new Map(categoryIds.map((id) => [id.toString(), false]));
        }
        return resolver.canUserDoInCategoriesMultiple(
            userId.toString(),
            categoryIds.map((id) => id.toString()),
            permission,
        );
    }

    private async getResolver(
        serverId: Types.ObjectId,
    ): Promise<PermissionResolver | null> {
        const now = Date.now();
        const serverIdStr = serverId.toString();
        const cached = this.resolverCache.get(serverIdStr);
        if (cached && cached.expiresAt > now) return cached.resolver;

        const [server, roles, channels, categories, members, everyoneRole] =
            await Promise.all([
                this.serverRepo.findById(serverId),
                this.roleRepo.findByServerId(serverId),
                this.channelRepo.findByServerId(serverId),
                this.categoryRepo.findByServerId(serverId),
                this.serverMemberRepo.findByServerId(serverId),
                this.roleRepo.findEveryoneRole(serverId),
            ]);

        if (!server) return null;

        const everyoneRoleId = everyoneRole
            ? getDocumentIdString(everyoneRole)
            : undefined;

        const resolverData: ServerData = {
            serverId,
            ownerId: new Types.ObjectId(server.ownerId),
            roles: roles.map((r): ServerRole => this.mapRole(r)),
            everyoneRoleId: everyoneRole
                ? (getDocumentId(everyoneRole) as Types.ObjectId)
                : undefined,
            channels: channels.map(
                (c): ResolverChannel => this.mapChannel(c, everyoneRoleId),
            ),
            categories: categories.map(
                (c): ResolverCategory => this.mapCategory(c, everyoneRoleId),
            ),
            members: members.map((m): ResolverMember => this.mapMember(m)),
        };

        const resolver = new PermissionResolver(resolverData, this.logger);
        this.resolverCache.set(serverIdStr, {
            resolver,
            expiresAt: now + this.cacheTtlMs,
        });

        return resolver;
    }

    private mapRole(role: IRole): ServerRole {
        return {
            id: getDocumentId(role) as Types.ObjectId,
            serverId: role.serverId,
            name: role.name,
            position: role.position,
            permissions: role.permissions,
        };
    }

    private mapChannel(
        channel: IChannel,
        everyoneRoleId: string | undefined,
    ): ResolverChannel {
        const overrides = remapEveryoneOverrideKey(
            extractOverridesToMap(
                channel.permissions as unknown as PermissionOverrideSource,
            ),
            everyoneRoleId,
        );

        return {
            id: getDocumentId(channel) as Types.ObjectId,
            serverId: channel.serverId,
            categoryId: channel.categoryId ?? null,
            overrides,
        };
    }

    private mapCategory(
        category: ICategory,
        everyoneRoleId: string | undefined,
    ): ResolverCategory {
        const overrides = remapEveryoneOverrideKey(
            extractOverridesToMap(
                category.permissions as unknown as PermissionOverrideSource,
            ),
            everyoneRoleId,
        );

        return {
            id: getDocumentId(category) as Types.ObjectId,
            serverId: category.serverId,
            overrides,
        };
    }

    private mapMember(member: IServerMember): ResolverMember {
        return {
            id: getDocumentId(member) as Types.ObjectId,
            serverId: member.serverId,
            userId: member.userId,
            roleIds: member.roles,
            communicationDisabledUntil: member.communicationDisabledUntil,
        };
    }
}
