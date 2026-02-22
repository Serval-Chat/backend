import { injectable, inject } from 'inversify';
import { Injectable, Inject } from '@nestjs/common';
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

    invalidateCache(serverId: Types.ObjectId): void {
        this.resolverCache.delete(serverId.toString());
    }

    async getHighestRolePosition(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
    ): Promise<number> {
        const resolver = await this.getResolver(serverId);
        if (!resolver) return -1;
        return resolver.getHighestRolePosition(userId.toString());
    }

    async hasPermission(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
        permission: string,
    ): Promise<boolean> {
        const resolver = await this.getResolver(serverId);
        if (!resolver) return false;
        if (!isPermissionKey(permission)) return false;
        return resolver.hasServerPermission(userId.toString(), permission);
    }

    async hasChannelPermission(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
        channelId: Types.ObjectId,
        permission: string,
    ): Promise<boolean> {
        const resolver = await this.getResolver(serverId);
        if (!resolver) return false;
        if (!isPermissionKey(permission)) return false;
        return resolver.canUserDo(userId.toString(), channelId.toString(), permission);
    }

    private async getResolver(
        serverId: Types.ObjectId,
    ): Promise<PermissionResolver | null> {
        if (!serverId) return null;

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
            ? everyoneRole._id.toString()
            : undefined;

        const resolverData: ServerData = {
            serverId,
            ownerId: server.ownerId,
            roles: roles.map((r): ServerRole => this.mapRole(r)),
            everyoneRoleId: everyoneRole ? everyoneRole._id : undefined,
            channels: channels.map(
                (c): ResolverChannel => this.mapChannel(c, everyoneRoleId),
            ),
            categories: categories.map(
                (c): ResolverCategory => this.mapCategory(c, everyoneRoleId),
            ),
            members: members.map((m): ResolverMember => this.mapMember(m)),
        };

        const resolver = new PermissionResolver(resolverData);
        this.resolverCache.set(serverIdStr, {
            resolver,
            expiresAt: now + this.cacheTtlMs,
        });

        return resolver;
    }

    private mapRole(role: IRole): ServerRole {
        return {
            id: role._id,
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
            id: channel._id,
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
            id: category._id,
            serverId: category.serverId,
            overrides,
        };
    }

    private mapMember(member: IServerMember): ResolverMember {
        return {
            id: member._id,
            serverId: member.serverId,
            userId: member.userId,
            roleIds: member.roles ?? [],
        };
    }
}
