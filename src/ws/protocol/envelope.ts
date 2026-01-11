/**
 * An envelope for WebSocket messages
 */

import {
    type IWsPingMessageEvent,
    type IWsPingResponseEvent,
} from './events/ping';
import {
    type IWsAuthenticateEvent,
    type IWsAuthenticatedEvent,
} from './events/auth';
import { type IWsErrorEvent } from './error';
import type {
    ISendMessageDmEvent,
    IMessageDmSentEvent,
    IMessageDmEvent,
    IEditMessageDmEvent,
    IMessageDmEditedEvent,
    IDeleteMessageDmEvent,
    IMessageDmDeletedEvent,
    IMarkDmReadEvent,
    IDmUnreadUpdatedEvent,
    ITypingDmEvent,
    ITypingDmBroadcastEvent,
    IJoinServerEvent,
    IServerJoinedEvent,
    ILeaveServerEvent,
    IJoinChannelEvent,
    IChannelJoinedEvent,
    ILeaveChannelEvent,
    ISendMessageServerEvent,
    IMessageServerSentEvent,
    IMessageServerEvent,
    IEditMessageServerEvent,
    IMessageServerEditedEvent,
    IDeleteMessageServerEvent,
    IMessageServerDeletedEvent,
    IMarkChannelReadEvent,
    IChannelUnreadUpdatedEvent,
    ITypingServerEvent,
    ITypingServerBroadcastEvent,
} from './events/messages';
import type {
    IPresenceSyncEvent,
    IUserOnlineEvent,
    IUserOfflineEvent,
    ISetStatusEvent,
    IStatusUpdatedEvent,
    IUserUpdatedEvent,
    IUserBannerUpdatedEvent,
    IDisplayNameUpdatedEvent,
    IStatusUpdateLegacyEvent,
} from './events/presence';
import type {
    IAddReactionEvent,
    IReactionAddedEvent,
    IRemoveReactionEvent,
    IReactionRemovedEvent,
} from './events/reactions';
import type { IMentionEvent } from './events/mentions';
import type {
    IServerUpdatedEvent,
    IServerDeletedEvent,
    IServerIconUpdatedEvent,
    IServerBannerUpdatedEvent,
    IMemberAddedEvent,
    IMemberRemovedEvent,
    IMemberUpdatedEvent,
    IMemberBannedEvent,
    IMemberUnbannedEvent,
    IOwnershipTransferredEvent,
    IChannelCreatedEvent,
    IChannelUpdatedEvent,
    IChannelDeletedEvent,
    IChannelsReorderedEvent,
    ICategoryCreatedEvent,
    ICategoryUpdatedEvent,
    ICategoryDeletedEvent,
    ICategoriesReorderedEvent,
    IChannelPermissionsUpdatedEvent,
    ICategoryPermissionsUpdatedEvent,
    IRoleCreatedEvent,
    IRoleUpdatedEvent,
    IRoleDeletedEvent,
    IRolesReorderedEvent,
    IEmojiUpdatedEvent,
    IWarningEvent,
} from './events/server_notifications';
import type {
    IIncomingRequestAddedEvent,
    IIncomingRequestRemovedEvent,
    IFriendAddedEvent,
    IFriendRemovedEvent,
} from './events/friendship';

export type AnyMessageWsEvent =
    | IWsPingMessageEvent
    | IWsAuthenticateEvent
    // DM Messages
    | ISendMessageDmEvent
    | IEditMessageDmEvent
    | IDeleteMessageDmEvent
    | IMarkDmReadEvent
    | ITypingDmEvent
    // Server Messages
    | IJoinServerEvent
    | ILeaveServerEvent
    | IJoinChannelEvent
    | ILeaveChannelEvent
    | ISendMessageServerEvent
    | IEditMessageServerEvent
    | IDeleteMessageServerEvent
    | IMarkChannelReadEvent
    | ITypingServerEvent
    // Presence & Status
    | ISetStatusEvent
    // Reactions
    | IAddReactionEvent
    | IRemoveReactionEvent;

export type AnyResponseWsEvent =
    | IWsPingResponseEvent
    | IWsAuthenticatedEvent
    | IWsErrorEvent
    // DM Messages
    | IMessageDmSentEvent
    | IMessageDmEvent
    | IMessageDmEditedEvent
    | IMessageDmDeletedEvent
    | IDmUnreadUpdatedEvent
    | ITypingDmBroadcastEvent
    // Server Messages
    | IServerJoinedEvent
    | IChannelJoinedEvent
    | IMessageServerSentEvent
    | IMessageServerEvent
    | IMessageServerEditedEvent
    | IMessageServerDeletedEvent
    | IChannelUnreadUpdatedEvent
    | ITypingServerBroadcastEvent
    // Server Notifications
    | IServerUpdatedEvent
    | IServerDeletedEvent
    | IServerIconUpdatedEvent
    | IServerBannerUpdatedEvent
    | IMemberAddedEvent
    | IMemberRemovedEvent
    | IMemberUpdatedEvent
    | IMemberBannedEvent
    | IMemberUnbannedEvent
    | IOwnershipTransferredEvent
    | IChannelCreatedEvent
    | IChannelUpdatedEvent
    | IChannelDeletedEvent
    | IChannelsReorderedEvent
    | ICategoryCreatedEvent
    | ICategoryUpdatedEvent
    | ICategoryDeletedEvent
    | ICategoriesReorderedEvent
    | IChannelPermissionsUpdatedEvent
    | ICategoryPermissionsUpdatedEvent
    | IRoleCreatedEvent
    | IRoleUpdatedEvent
    | IRoleDeletedEvent
    | IRolesReorderedEvent
    | IEmojiUpdatedEvent
    | IWarningEvent
    // Friendship
    | IIncomingRequestAddedEvent
    | IIncomingRequestRemovedEvent
    | IFriendAddedEvent
    | IFriendRemovedEvent
    // Presence & Status
    | IPresenceSyncEvent
    | IUserOnlineEvent
    | IUserOfflineEvent
    | IStatusUpdatedEvent
    | IUserUpdatedEvent
    | IUserBannerUpdatedEvent
    | IDisplayNameUpdatedEvent
    | IStatusUpdateLegacyEvent
    // Reactions
    | IReactionAddedEvent
    | IReactionRemovedEvent
    // Notifications
    | IMentionEvent;

export interface IWsEnvelope {
    /**
     * Unique ID for messages, used for deduping and acking.
     */
    id: string;

    // Event type and data
    event: AnyMessageWsEvent | AnyResponseWsEvent;

    /**
     * Message metadata for ACKing and timestamping.
     */
    meta: {
        replyTo: string; // for acking
        ts: number; // timestamp
    };
}
