import { injectable, inject } from 'inversify';
import { Injectable, Inject } from '@nestjs/common';
import { TYPES } from '@/di/types';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IServerMember } from '@/di/interfaces/IServerMemberRepository';
import type { IRoleRepository, IRole } from '@/di/interfaces/IRoleRepository';
import type { ICategoryRepository, ICategory } from '@/di/interfaces/ICategoryRepository';
import type { IChannelRepository, IChannel } from '@/di/interfaces/IChannelRepository';
import { PermissionResolver } from '@/permissions/PermissionResolver';
import type {
    Permissions,
    ServerData,
    ServerRole,
    Channel as ResolverChannel,
    Category as ResolverCategory,
    ServerMember as ResolverMember,
} from '@/permissions/types';
import { isPermissionKey } from '@/permissions/types';

type PermissionOverrideSource =
    | Map<string, unknown>
    | Record<string, unknown>
    | undefined;

function toIdString(id: string | { toString(): string }): string {
    return typeof id === 'string' ? id : id.toString();
}

function remapEveryoneOverrideKey(
    overrides: Map<string, Permissions> | undefined,
    everyoneRoleId: string | undefined,
): Map<string, Permissions> | undefined {
    if (!overrides || !everyoneRoleId) return overrides;

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
            (out as Record<string, boolean>)[k] = v;
        }
    }
    return out;
}

function extractOverridesToMap(source: PermissionOverrideSource):
    | Map<string, Permissions>
    | undefined {
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

@injectable()
@Injectable()
export class PermissionService {
    private readonly resolverCache = new Map<string, CachedResolver>();

    private readonly cacheTtlMs: number;

    constructor(
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
    ) {
        this.cacheTtlMs = 5 * 60 * 1000;
    }

    invalidateCache(serverId: string): void {
        this.resolverCache.delete(serverId);
    }

    async getHighestRolePosition(
        serverId: string,
        userId: string,
    ): Promise<number> {
        const resolver = await this.getResolver(serverId);
        if (!resolver) return -1;
        return resolver.getHighestRolePosition(userId);
    }

    async hasPermission(
        serverId: string,
        userId: string,
        permission: string,
    ): Promise<boolean> {
        const resolver = await this.getResolver(serverId);
        if (!resolver) return false;
        if (!isPermissionKey(permission)) return false;
        return resolver.hasServerPermission(userId, permission);
    }

    async hasChannelPermission(
        serverId: string,
        userId: string,
        channelId: string,
        permission: string,
    ): Promise<boolean> {
        const resolver = await this.getResolver(serverId);
        if (!resolver) return false;
        if (!isPermissionKey(permission)) return false;
        return resolver.canUserDo(userId, channelId, permission);
    }

    private async getResolver(serverId: string): Promise<PermissionResolver | null> {
        if (!serverId) return null;

        const now = Date.now();
        const cached = this.resolverCache.get(serverId);
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

        const everyoneRoleId = everyoneRole ? toIdString(everyoneRole._id) : undefined;

        const resolverData: ServerData = {
            serverId,
            ownerId: toIdString(server.ownerId),
            roles: roles.map((r): ServerRole => this.mapRole(r)),
            everyoneRoleId,
            channels: channels.map((c): ResolverChannel =>
                this.mapChannel(c, everyoneRoleId),
            ),
            categories: categories.map((c): ResolverCategory =>
                this.mapCategory(c, everyoneRoleId),
            ),
            members: members.map((m): ResolverMember => this.mapMember(m)),
        };

        const resolver = new PermissionResolver(resolverData);
        this.resolverCache.set(serverId, {
            resolver,
            expiresAt: now + this.cacheTtlMs,
        });

        return resolver;
    }

    private mapRole(role: IRole): ServerRole {
        return {
            id: toIdString(role._id),
            serverId: toIdString(role.serverId),
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
            id: toIdString(channel._id),
            serverId: toIdString(channel.serverId),
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
            id: toIdString(category._id),
            serverId: toIdString(category.serverId),
            overrides,
        };
    }

    private mapMember(member: IServerMember): ResolverMember {
        return {
            id: toIdString(member._id),
            serverId: toIdString(member.serverId),
            userId: toIdString(member.userId),
            roleIds: (member.roles ?? []).map((r) => toIdString(r)),
        };
    }
}
