# WebSocket Protocol Documentation

> **Version**: 2.2  
> **Protocol**: Native WebSocket + Protobuf  
> **Status**: Specification

---

## 1. Architecture Overview

Serchat uses a native WebSocket infrastructure designed for high performance and type safety. The system moves away from text-based JSON protocols to binary **Protocol Buffers (Protobuf)** for efficient data serialization, resulting in smaller payloads and faster parsing.

### Key Technologies

*   **Transport**: Native WebSockets (`ws` library)
*   **Serialization**: Google Protocol Buffers (`protobufjs`)
*   **Health Checks**: `ws-heartbeat` for connection liveness
*   **Architecture**: Event-based Gateway pattern

---

## 2. Connection & Lifecycle

### Connection URL
```
ws://catfla.re/ws
```

### Authentication
Authentication is performed immediately upon connection. The client must verify identity in one of two ways:

1.  **Query Parameter**: `ws://catfla.re/ws?token=<JWT>` (Recommended for browsers)
2.  **Auth Frame**: Sending an `AuthRequest` message as the first frame.

**Failure**: If authentication fails, the server sends an error frame and closes the connection with code `4001`.

### Data Framing
All messages are binary. The foundational unit is the `WebSocketFrame`. Events are defined as strict Enums to ensure type safety and reduced payload size.

```protobuf
syntax = "proto3";

// Defines all possible event types in the system
enum EventType {
  UNKNOWN = 0;
  
  // Chat (Direct Messages)
  CHAT_SEND = 10;
  CHAT_MESSAGE = 11;      // Incoming DM
  CHAT_TYPING = 12;
  CHAT_MARK_READ = 13;
  CHAT_EDIT = 14;
  CHAT_DELETE = 15;
  CHAT_MESSAGE_EDITED = 16;
  CHAT_MESSAGE_DELETED = 17;
  DM_UNREAD_UPDATE = 18;  // DM unread count change

  // Server (Channel) Subscription & Actions
  SERVER_JOIN = 20;       // Subscribe to server events
  SERVER_LEAVE = 21;      // Unsubscribe from server events
  CHANNEL_JOIN = 22;      // Subscribe to channel (typing, focus)
  CHANNEL_LEAVE = 23;     // Unsubscribe from channel
  SERVER_SEND = 24;       // Send message to channel
  SERVER_MESSAGE = 25;    // Incoming server message
  SERVER_TYPING = 26;     // Incoming typing indicator
  SERVER_EDIT = 27;
  SERVER_DELETE = 28;
  SERVER_MESSAGE_EDITED = 29;
  SERVER_MESSAGE_DELETED = 30;
  CHANNEL_MARK_READ = 31;
  CHANNEL_UNREAD_UPDATE = 32;

  // Presence & Status
  PRESENCE_SYNC = 40;     // Initial state sync (all online users)
  PRESENCE_UPDATE = 41;   // Incoming presence update (online/offline)
  STATUS_SET = 42;        // Set own status
  STATUS_SUB = 43;        // Subscribe to specific users status
  STATUS_UNSUB = 44;      // Unsubscribe from status
  STATUS_UPDATE = 45;     // Incoming status update

  // Reactions
  REACTION_ADD = 50;
  REACTION_REMOVE = 51;
  REACTION_UPDATED = 52;  // Broadcast when reactions on a message change

  // System & Security
  PING_NOTIFICATION = 60; // Mention/Notification (different from WS heartbeat)
  SECURITY_BAN = 61;      // User was banned, connection will close
}

message WebSocketFrame {
  enum Type {
    UNKNOWN_TYPE = 0;
    EVENT = 1;      // Standard event message
    REQUEST = 2;    // Request requiring a response
    RESPONSE = 3;   // Response to a request
    ERROR = 4;      // Error response
  }

  Type type = 1;
  string id = 2;           // Request ID (required for REQUEST/RESPONSE)
  EventType event = 3;     // Enum-based event type
  bytes payload = 4;       // Serialized inner Protobuf message
}
```

### Initial State & Heartbeats
Upon successful connection, the server immediately sends:
1.  **PRESENCE_SYNC**: A list of all currently online users.
2.  **Stored Pings**: Any pings (mentions) the user received while offline.

Connection health is managed by `ws-heartbeat`.
*   **Server**: Sends `ping` control frames every 30 seconds.
*   **Client**: Must respond with `pong` within 5s.

---

## 3. Protobuf Definitions

### Common Types

```protobuf
message User {
  string id = 1;
  string username = 2;
  string display_name = 3;
  string avatar_url = 4;
  string bio = 5;
  Status status = 6;
  UserAppearance appearance = 7;
}

message UserAppearance {
  string username_font = 1;
  Gradient username_gradient = 2;
  Glow username_glow = 3;
}

message Status {
  string text = 1;
  string emoji = 2;
  int64 expires_at = 3; // Timestamp in MS
}

message Reaction {
  string emoji = 1;
  string emoji_type = 2; // "unicode" or "custom"
  string emoji_id = 3;   // ID if custom
  repeated string user_ids = 4; // Users who reacted with this emoji
  int32 count = 5;
}

message Gradient {
  bool enabled = 1;
  repeated string colors = 2;
  int32 angle = 3;
}

message Glow {
  bool enabled = 1;
  string color = 2;
  int32 intensity = 3;
}
```

### Messaging

```protobuf
message Message {
  string id = 1;
  string sender_id = 2;
  string receiver_id = 3;  // User ID (DM) or Channel ID (Server)
  string text = 4;
  string reply_to_id = 5;
  int64 created_at = 6;
  int64 updated_at = 7;
  bool is_edited = 8;
  repeated Reaction reactions = 9;
  string server_id = 10;   // Optional (only for server messages)
}

message SendMessageRequest {
  string receiver_id = 1;  // User ID or Channel ID
  string text = 2;
  string reply_to_id = 3;
  string server_id = 4;    // Required for server messages
}

message UnreadUpdate {
  string peer_id = 1;      // User ID (for DMs)
  string server_id = 2;    // For server channels
  string channel_id = 3; 
  int32 count = 4;
  int64 last_message_at = 5;
}
```

### Reactions & Notifications

```protobuf
message ReactionRequest {
  string message_id = 1;
  string message_type = 2; // "dm" or "server"
  string emoji = 3;
  string emoji_type = 4;  // "unicode" or "custom"
  string emoji_id = 5;
  string server_id = 6;
  string channel_id = 7;
}

message Ping {
  string id = 1;
  string type = 2; // "mention"
  string sender = 3;
  string sender_id = 4;
  string server_id = 5;
  string channel_id = 6;
  Message message = 7; // The message that triggered the ping
  int64 timestamp = 8;
}
```

---

## 4. Event Reference

### 4.1 Chat (Direct Messages)

| Event Enum | Request Proto | Response/Broadcast Proto | Description |
| :--- | :--- | :--- | :--- |
| `CHAT_SEND` | `SendMessageRequest` | `Message` | Send a DM. |
| `CHAT_MESSAGE` | N/A | `Message` | Incoming DM. |
| `CHAT_TYPING` | `TypingRequest` | `TypingBroadcast` | Signal typing status. |
| `DM_UNREAD_UPDATE`| N/A | `UnreadUpdate` | DM unread count changed. |
| `CHAT_EDIT` | `EditMessageRequest` | `Message` | Edit a DM. |
| `CHAT_DELETE` | `DeleteMessageRequest`| `DeleteMessageBroadcast`| Delete a DM. |

### 4.2 Server (Channels)

| Event Enum | Request Proto | Response/Broadcast Proto | Description |
| :--- | :--- | :--- | :--- |
| `SERVER_JOIN` | `JoinServerRequest` | `StatusResponse` | Subscribe to server events. |
| `CHANNEL_JOIN` | `JoinChannelRequest` | `StatusResponse` | Subscribe to channel events. |
| `SERVER_SEND` | `SendMessageRequest` | `Message` | Send message to channel. |
| `SERVER_MESSAGE` | N/A | `Message` | Incoming channel message. |
| `REACTION_ADD` | `ReactionRequest` | `ReactionUpdate` | Add reaction to message. |
| `PING_NOTIFICATION`| N/A| `Ping` | Received a mention/ping. |

### 4.3 System & Presence

| Event Enum | Request Proto | Response/Broadcast Proto | Description |
| :--- | :--- | :--- | :--- |
| `PRESENCE_SYNC` | N/A | `PresenceSync` | Initial list of online users. |
| `PRESENCE_UPDATE` | N/A | `PresenceUpdate` | User came online/offline. |
| `SECURITY_BAN` | N/A | `BanInfo` | User banned, disconnected. |

---

## 5. Error Handling

Errors are returned as `WebSocketFrame` with `Type.ERROR`.

**Error Payload Definition**:
```protobuf
message ErrorPayload {
  string code = 1;     // e.g. "PERMISSION_DENIED", "NOT_FRIENDS"
  string message = 2;  // Human readable
  map<string, string> details = 3;
}
```
