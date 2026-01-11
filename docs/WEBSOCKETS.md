# WebSocket API Reference

This document provides areference for Serchat WebSocket API.

---

## Connection & Authentication

1.  **Handshake**: Connect to `/ws` via standard WebSocket.
2.  **Grace Period**: Connections remain unauthenticated for 30 seconds.
3.  **Authentication**: Send the `authenticate` event with your JWT.

### TypeScript Interfaces

```typescript
export interface IWsAuthenticateEvent {
    type: "authenticate";
    payload: {
        token: string; // JWT
    };
}

export interface IWsAuthenticatedEvent {
    type: "authenticated";
    payload: {
        user: {
            id: string;
            username: string;
            displayName?: string;
            profilePicture?: string;
        };
    };
}

export interface IWsErrorEvent {
    type: "error";
    payload: {
        code: string; // e.g., "AUTHENTICATION_FAILED", "UNAUTHORIZED"
        message: string;
        details?: any;
    };
}
```

### Event Reference
| Event Type      | Dir.   | Description    | Payload Type            |
| :-------------- | :----- | :------------- | :---------------------- |
| `ping`          | C -> S | Heartbeat.     | `{}`                    |
| `pong`          | S -> C | Heartbeat ACK. | `{}`                    |
| `authenticate`  | C -> S | JWT login.     | `IWsAuthenticateEvent`  |
| `authenticated` | S -> C | Login success. | `IWsAuthenticatedEvent` |
| `error`         | S -> C | General error. | `IWsErrorEvent`         |

---

## Wire Format (The Envelope)

Every message must follow the `IWsEnvelope` structure:

```typescript
export interface IWsEnvelope {
    id: string; // Unique message ID (UUID v4)
    event: {
        type: string;
        payload: any;
    };
    meta: {
        replyTo?: string; // ID of the request being replied to
        ts: number;       // Unix timestamp in ms
    };
}
```

---

## Messaging

### Direct Messages (DMs)

```typescript
export interface IMessageDm {
    messageId: string;
    senderId: string;
    senderUsername: string;
    receiverId: string;
    receiverUsername: string;
    text: string;
    createdAt: string;
    replyToId?: string;
    repliedTo?: {
        messageId: string;
        senderId: string;
        senderUsername: string;
        text: string;
    };
    isEdited: boolean;
}
```

| Event Type           | Dir.   | Description         | Payload                                                    |
| :------------------- | :----- | :------------------ | :--------------------------------------------------------- |
| `send_message_dm`    | C -> S | Post a DM.          | `{ receiverId: string, text: string, replyToId?: string }` |
| `message_dm_sent`    | S -> C | Confirm DM sent.    | `IMessageDm`                                               |
| `message_dm`         | S -> C | New DM arrival.     | `IMessageDm`                                               |
| `edit_message_dm`    | C -> S | Edit a DM.          | `{ messageId: string, text: string }`                      |
| `message_dm_edited`  | S -> C | DM changed.         | `{ messageId: string, text: string, editedAt: string }`    |
| `delete_message_dm`  | C -> S | Delete a DM.        | `{ messageId: string }`                                    |
| `message_dm_deleted` | S -> C | DM removed.         | `{ messageId: string }`                                    |
| `mark_dm_read`       | C -> S | ACK a conversation. | `{ peerId: string }`                                       |
| `dm_unread_updated`  | S -> C | Unread count pulse. | `{ peerId: string, count: number }`                        |
| `typing_dm`          | C -> S | Indicate typing.    | `{ receiverId: string }`                                   |
| `typing_dm`          | S -> C | User is typing.     | `{ senderId: string, senderUsername: string }`             |

---

### Server & Channel Room Messages

```typescript
export interface IMessageServer {
    messageId: string;
    serverId: string;
    channelId: string;
    senderId: string;
    senderUsername: string;
    text: string;
    createdAt: string;
    replyToId?: string;
    isEdited: boolean;
    isWebhook: boolean;
    webhookUsername?: string;
    webhookAvatarUrl?: string;
}
```

| Event Type               | Dir.   | Description         | Payload                                                                     |
| :----------------------- | :----- | :------------------ | :-------------------------------------------------------------------------- |
| `send_message_server`    | C -> S | Post in channel.    | `{ serverId: string, channelId: string, text: string, replyToId?: string }` |
| `message_server_sent`    | S -> C | Confirm msg sent.   | `IMessageServer`                                                            |
| `message_server`         | S -> C | New channel msg.    | `IMessageServer`                                                            |
| `edit_message_server`    | C -> S | Edit channel msg.   | `{ messageId: string, text: string }`                                       |
| `message_server_edited`  | S -> C | Edit broadcast.     | `{ messageId: string, text: string, editedAt: string }`                     |
| `delete_message_server`  | C -> S | Delete channel msg. | `{ serverId: string, messageId: string }`                                   |
| `message_server_deleted` | S -> C | Delete broadcast.   | `{ messageId: string, channelId: string }`                                  |
| `mark_channel_read`      | C -> S | ACK a channel.      | `{ serverId: string, channelId: string }`                                   |
| `channel_unread_updated` | S -> C | Read status pulse.  | `{ channelId: string, lastMessageAt: string, senderId: string }`            |
| `typing_server`          | C -> S | Indicate typing.    | `{ serverId: string, channelId: string }`                                   |
| `typing_server`          | S -> C | User is typing.     | `{ channelId: string, userId: string, username: string }`                   |

---

## Server & Channel Management

| Event Type       | Dir.   | Description           | Payload                                   |
| :--------------- | :----- | :-------------------- | :---------------------------------------- |
| `join_server`    | C -> S | Subscribe to server.  | `{ serverId: string }`                    |
| `server_joined`  | S -> C | Join confirmed.       | `{ serverId: string }`                    |
| `leave_server`   | C -> S | Unsubscribe.          | `{ serverId: string }`                    |
| `join_channel`   | C -> S | Subscribe to channel. | `{ serverId: string, channelId: string }` |
| `channel_joined` | S -> C | Join confirmed.       | `{ serverId: string, channelId: string }` |
| `leave_channel`  | C -> S | Unsubscribe.          | `{ channelId: string }`                   |

---

## Presence, Profile & Friends

```typescript
export interface IPresenceSync {
    online: {
        userId: string;
        username: string;
        status?: string;
    }[];
}
```

| Event Type               | Dir.   | Description          | Payload                                                                               |
| :----------------------- | :----- | :------------------- | :------------------------------------------------------------------------------------ |
| `presence_sync`          | S -> C | Initial online list. | `IPresenceSync`                                                                       |
| `user_online`            | S -> C | User connected.      | `{ userId: string, username: string, status?: string }`                               |
| `user_offline`           | S -> C | User disconnected.   | `{ userId: string, username: string }`                                                |
| `set_status`             | C -> S | Set status text.     | `{ status: string }`                                                                  |
| `status_updated`         | S -> C | Status changed.      | `{ userId: string, username: string, status: string }`                                |
| `user_updated`           | S -> C | Profile pfp/badges.  | `{ userId: string, username: string, profilePicture?: string, displayName?: string }` |
| `user_banner_updated`    | S -> C | Banner changed.      | `{ username: string, userId: string, banner: string }`                                |
| `display_name_updated`   | S -> C | Display name change. | `{ username: string, userId: string, displayName: string }`                           |
| `incoming_request_added` | S -> C | New friend request.  | `{ _id: string, from: string, fromId: string, createdAt: string }`                    |
| `friend_added`           | S -> C | Request accepted.    | `{ friend: { id: string, username: string, ... } }`                                   |
| `friend_removed`         | S -> C | Friendship ended.    | `{ username: string, userId: string }`                                                |

---

## Reactions

| Event Type         | Dir.   | Description        | Payload                                                                                                                 |
| :----------------- | :----- | :----------------- | :---------------------------------------------------------------------------------------------------------------------- |
| `add_reaction`     | C -> S | Add emoji.         | `{ messageId: string, emoji: string, emojiType: "unicode" | "custom", emojiId?: string, messageType: "dm" | "server" }` |
| `reaction_added`   | S -> C | Emoji was added.   | `{ messageId: string, userId: string, username: string, emoji: string, emojiType, emojiId?, messageType }`              |
| `remove_reaction`  | C -> S | Remove emoji.      | `{ messageId: string, emoji: string, emojiType: "unicode" | "custom", emojiId?: string, messageType: "dm" | "server" }` |
| `reaction_removed` | S -> C | Emoji was removed. | `{ messageId: string, userId: string, username: string, emoji: string, emojiType, emojiId?, messageType }`              |

---

---

## Notifications & Mentions
 
 These events are sent to specific users (not broadcast to channels) to alert them of mentions or interactions.
 
 | Event Type | Dir.   | Description                | Payload                                                                                                           |
 | :--------- | :----- | :------------------------- | :---------------------------------------------------------------------------------------------------------------- |
 | `mention`  | S -> C | Mention or reaction alert. | `{ type: "mention" | "reaction", sender, senderId, serverId?, channelId?, message: IMessageServer | IMessageDm }` |
 
 ---
 
 ## Server Management Events
 
 These events are broadcast to all members of a server when management actions occur.
 
 | Event Type                     | Dir.   | Description               | Payload                                                                                       |
 | :----------------------------- | :----- | :------------------------ | :-------------------------------------------------------------------------------------------- |
 | `server_updated`               | S -> C | Server metadata update.   | `{ serverId: string, server: Partial<IServer> }`                                              |
 | `server_deleted`               | S -> C | Server disbanded.         | `{ serverId: string }`                                                                        |
 | `server_icon_updated`          | S -> C | Icon changed.             | `{ serverId: string, icon: string }`                                                          |
 | `server_banner_updated`        | S -> C | Banner changed.           | `{ serverId: string, banner: { type: 'image', value: string } }`                              |
 | `member_added`                 | S -> C | New user joined.          | `{ serverId: string, userId: string }`                                                        |
 | `member_removed`               | S -> C | User left/kicked.         | `{ serverId: string, userId: string }`                                                        |
 | `member_updated`               | S -> C | Role/nickname change.     | `{ serverId: string, userId: string, member: IServerMember }`                                 |
 | `member_banned`                | S -> C | User banned.              | `{ serverId: string, userId: string }`                                                        |
 | `member_unbanned`              | S -> C | User unbanned.            | `{ serverId: string, userId: string }`                                                        |
 | `ownership_transferred`        | S -> C | Server owner changed.     | `{ serverId: string, oldOwnerId: string, newOwnerId: string }`                                |
 | `channel_created`              | S -> C | New channel created.      | `{ serverId: string, channel: IChannel }`                                                     |
 | `channel_updated`              | S -> C | Channel metadata changed. | `{ serverId: string, channel: IChannel }`                                                     |
 | `channel_deleted`              | S -> C | Channel removed.          | `{ serverId: string, channelId: string }`                                                     |
 | `channels_reordered`           | S -> C | Channel list reordered.   | `{ serverId: string, channelPositions: { channelId, position }[] }`                           |
 | `category_created`             | S -> C | New category created.     | `{ serverId: string, category: ICategory }`                                                   |
 | `category_updated`             | S -> C | Category changed.         | `{ serverId: string, category: ICategory }`                                                   |
 | `category_deleted`             | S -> C | Category removed.         | `{ serverId: string, categoryId: string }`                                                    |
 | `categories_reordered`         | S -> C | Category list reordered.  | `{ serverId: string, categoryPositions: { categoryId, position }[] }`                         |
 | `channel_permissions_updated`  | S -> C | Channel perms changed.    | `{ serverId: string, channelId: string, permissions: Record<string, Record<string, bool>> }`  |
 | `category_permissions_updated` | S -> C | Category perms changed.   | `{ serverId: string, categoryId: string, permissions: Record<string, Record<string, bool>> }` |
 | `role_created`                 | S -> C | New role created.         | `{ serverId: string, role: IRole }`                                                           |
 | `role_updated`                 | S -> C | Role metadata changed.    | `{ serverId: string, role: IRole }`                                                           |
 | `role_deleted`                 | S -> C | Role removed.             | `{ serverId: string, roleId: string }`                                                        |
 | `roles_reordered`              | S -> C | Role list reordered.      | `{ serverId: string, rolePositions: { roleId, position }[] }`                                 |
 | `emoji_updated`                | S -> C | Server emojis changed.    | `{ serverId: string }`                                                                        |

---

## REST Trigger Mapping

| Triggering REST API                          | WS Event Emitted         | Audience          |
| :------------------------------------------- | :----------------------- | :---------------- |
| `POST /api/v1/friends`                       | `incoming_request_added` | Target User       |
| `POST /api/v1/friends/:id/accept`            | `friend_added`           | Both Users        |
| `DELETE /api/v1/friends/:id`                 | `friend_removed`         | Both Users        |
| `POST /api/v1/profile/picture`               | `user_updated`           | Friends & Mutuals |
| `PATCH /api/v1/profile/status`               | `status_updated`         | Friends & Mutuals |
| `PATCH /api/v1/servers/:id`                  | `server_updated`         | Server Members    |
| `POST /api/v1/servers/:id/channels`          | `channel_created`        | Server Members    |
| `PATCH /api/v1/servers/:id/channels/reorder` | `channels_reordered`     | Server Members    |
| `PATCH /api/v1/servers/:id/channels/:id`     | `channel_updated`        | Server Members    |
| `DELETE /api/v1/servers/:id/channels/:id`    | `channel_deleted`        | Server Members    |
| `POST /api/v1/servers/:id/categories`        | `category_created`       | Server Members    |
| `PATCH /api/v1/servers/:id/roles`            | `role_created`           | Server Members    |
| `DELETE /api/v1/servers/:id/members/:uid`    | `member_removed` (Kick)  | Server Members    |
| `POST /api/v1/servers/:id/bans/:uid`         | `member_banned`          | Server Members    |
| `POST /api/v1/invites/:code/join`            | `member_added`           | Server Members    |
| `POST /api/v1/servers/:id/emojis`            | `emoji_updated`          | Server Members    |

