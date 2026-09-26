import type { PermissionService } from '@/permissions/PermissionService';
import type { IChannel } from '@/di/interfaces/IChannelRepository';

type VisibilityChannel = Pick<IChannel, 'snowflakeId' | 'categoryId'>;

export const resolveChannelVisibility = async (
    permissionService: PermissionService,
    serverId: string,
    userId: string,
    channels: VisibilityChannel[],
): Promise<Map<string, boolean>> => {
    if (channels.length === 0) return new Map();

    const categoryIds = [
        ...new Set(
            channels
                .map((channel): string | null | undefined => channel.categoryId)
                .filter((id): id is string => id !== null && id !== undefined),
        ),
    ];

    const [channelPermissions, categoryPermissions] = await Promise.all([
        permissionService.hasChannelPermissions(
            serverId,
            userId,
            channels.map((channel): string => channel.snowflakeId),
            'viewChannels',
        ),
        permissionService.hasCategoryPermissions(
            serverId,
            userId,
            categoryIds,
            'viewCategories',
        ),
    ]);

    const visibility = new Map<string, boolean>();
    for (const channel of channels) {
        const canViewChannel =
            channelPermissions.get(channel.snowflakeId) === true;
        const canViewCategory =
            channel.categoryId === null ||
            channel.categoryId === undefined ||
            categoryPermissions.get(channel.categoryId) === true;
        visibility.set(channel.snowflakeId, canViewChannel && canViewCategory);
    }
    return visibility;
};

export const isChannelUnread = (
    channel: Pick<IChannel, 'type' | 'lastMessageAt'>,
    lastReadAt: Date | undefined,
    canView: boolean,
): boolean => {
    if (channel.type === 'link') return false;
    if (!canView) return false;
    const lastMessageAt = channel.lastMessageAt;
    if (lastMessageAt === undefined) return false;
    if (lastReadAt === undefined) return true;
    return new Date(lastMessageAt) > new Date(lastReadAt);
};
