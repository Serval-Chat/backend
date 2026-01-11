import type { WsEvent } from '@/ws/protocol/event';
import type { IServer } from '@/di/interfaces/IServerRepository';
import type { IChannel } from '@/di/interfaces/IChannelRepository';
import type { ICategory } from '@/di/interfaces/ICategoryRepository';
import type { IServerMember } from '@/di/interfaces/IServerMemberRepository';
import type { IRole } from '@/di/interfaces/IRoleRepository';

/**
 * Server → Client (Broadcast)
 * Server details updated.
 */
export interface IServerUpdatedEvent
    extends WsEvent<
        'server_updated',
        {
            serverId: string;
            server: Partial<IServer>;
        }
    > {}

/**
 * Server → Client (Broadcast)
 * Server deleted.
 */
export interface IServerDeletedEvent
    extends WsEvent<
        'server_deleted',
        {
            serverId: string;
        }
    > {}

/**
 * Server → Client (Broadcast)
 * Server icon updated.
 */
export interface IServerIconUpdatedEvent
    extends WsEvent<
        'server_icon_updated',
        {
            serverId: string;
            icon: string;
        }
    > {}

/**
 * Server → Client (Broadcast)
 * Server banner updated.
 */
export interface IServerBannerUpdatedEvent
    extends WsEvent<
        'server_banner_updated',
        {
            serverId: string;
            banner: { type: 'image'; value: string };
        }
    > {}

// ============================================================================
// Member Events
// ============================================================================

export interface IMemberAddedEvent
    extends WsEvent<
        'member_added',
        {
            serverId: string;
            userId: string;
        }
    > {}

export interface IMemberRemovedEvent
    extends WsEvent<
        'member_removed',
        {
            serverId: string;
            userId: string;
        }
    > {}

export interface IMemberUpdatedEvent
    extends WsEvent<
        'member_updated',
        {
            serverId: string;
            userId: string;
            member: IServerMember;
        }
    > {}

export interface IMemberBannedEvent
    extends WsEvent<
        'member_banned',
        {
            serverId: string;
            userId: string;
        }
    > {}

export interface IMemberUnbannedEvent
    extends WsEvent<
        'member_unbanned',
        {
            serverId: string;
            userId: string;
        }
    > {}

export interface IOwnershipTransferredEvent
    extends WsEvent<
        'ownership_transferred',
        {
            serverId: string;
            oldOwnerId: string;
            newOwnerId: string;
        }
    > {}

// ============================================================================
// Channel & Category Events
// ============================================================================

export interface IChannelCreatedEvent
    extends WsEvent<
        'channel_created',
        {
            serverId: string;
            channel: IChannel;
        }
    > {}

export interface IChannelUpdatedEvent
    extends WsEvent<
        'channel_updated',
        {
            serverId: string;
            channel: IChannel;
        }
    > {}

export interface IChannelDeletedEvent
    extends WsEvent<
        'channel_deleted',
        {
            serverId: string;
            channelId: string;
        }
    > {}

export interface IChannelsReorderedEvent
    extends WsEvent<
        'channels_reordered',
        {
            serverId: string;
            channelPositions: { channelId: string; position: number }[];
        }
    > {}

export interface ICategoryCreatedEvent
    extends WsEvent<
        'category_created',
        {
            serverId: string;
            category: ICategory;
        }
    > {}

export interface ICategoryUpdatedEvent
    extends WsEvent<
        'category_updated',
        {
            serverId: string;
            category: ICategory;
        }
    > {}

export interface ICategoryDeletedEvent
    extends WsEvent<
        'category_deleted',
        {
            serverId: string;
            categoryId: string;
        }
    > {}

export interface ICategoriesReorderedEvent
    extends WsEvent<
        'categories_reordered',
        {
            serverId: string;
            categoryPositions: { categoryId: string; position: number }[];
        }
    > {}

export interface IChannelPermissionsUpdatedEvent
    extends WsEvent<
        'channel_permissions_updated',
        {
            serverId: string;
            channelId: string;
            permissions: Record<string, Record<string, boolean>>;
        }
    > {}

export interface ICategoryPermissionsUpdatedEvent
    extends WsEvent<
        'category_permissions_updated',
        {
            serverId: string;
            categoryId: string;
            permissions: Record<string, Record<string, boolean>>;
        }
    > {}

// ============================================================================
// Role Events
// ============================================================================

export interface IRoleCreatedEvent
    extends WsEvent<
        'role_created',
        {
            serverId: string;
            role: IRole;
        }
    > {}

export interface IRoleUpdatedEvent
    extends WsEvent<
        'role_updated',
        {
            serverId: string;
            role: IRole;
        }
    > {}

export interface IRoleDeletedEvent
    extends WsEvent<
        'role_deleted',
        {
            serverId: string;
            roleId: string;
        }
    > {}

export interface IRolesReorderedEvent
    extends WsEvent<
        'roles_reordered',
        {
            serverId: string;
            rolePositions: { roleId: string; position: number }[];
        }
    > {}

// ============================================================================
// Emoji Events
// ============================================================================

export interface IEmojiUpdatedEvent
    extends WsEvent<
        'emoji_updated',
        {
            serverId: string;
        }
    > {}

/**
 * Server → Client (Direct)
 * Warning issued to user.
 */
export interface IWarningEvent
    extends WsEvent<
        'warning',
        {
            _id: string;
            userId: string;
            issuedBy: string;
            message: string;
            timestamp: Date;
            acknowledged: boolean;
            acknowledgedAt?: Date;
        }
    > {}
