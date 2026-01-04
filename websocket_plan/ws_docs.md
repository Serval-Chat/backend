# WebSocket Protocol Documentation

> **Version**: 2.1  
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
ws://api.serchat.io/ws
```

### Authentication
Authentication is performed immediately upon connection. The client must verify identity in one of two ways:

1.  **Query Parameter**: `ws://api.serchat.io/ws?token=<JWT>` (Recommended for browsers)
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

  // Server (Channel) Subscription & Actions
  SERVER_JOIN = 20;       // Subscribe to server events
  SERVER_LEAVE = 21;      // Unsubscribe from server events
  CHANNEL_JOIN = 22;      // Subscribe to channel (typing, focus)
  CHANNEL_LEAVE = 23;     // Unsubscribe from channel
  SERVER_SEND = 24;       // Send message to channel
  SERVER_MESSAGE = 25;    // Incoming server message
  SERVER_TYPING = 26;     // Incoming typing indicator

  // Presence & Status
  PRESENCE_SUB = 30;      // Subscribe to user presence
  STATUS_SET = 31;        // Set own status
  PRESENCE_UPDATE = 32;   // Incoming presence update
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

### Heartbeats (`ws-heartbeat`)
Connection health is managed by `ws-heartbeat`.
*   **Server**: Sends `ping` control frames (or custom ping messages depending on config) every 30 seconds.
*   **Client**: Must respond with `pong` within the timeout window (default 5s).
*   **Timeout**: Connections failing to respond are forcibly terminated to prevent ghost connections.

---

## 3. Protobuf Definitions

### Common Types

```protobuf
message User {
  string id = 1;
  string username = 2;
  string display_name = 3;
  string avatar_url = 4;
}

message Status {
  string text = 1;
  string emoji = 2;
  int64 expires_at = 3;
}
```

### Messaging

```protobuf
message Message {
  string id = 1;
  string sender_id = 2;
  string receiver_id = 3;  // User ID or Channel ID
  string content = 4;
  string reply_to_id = 5;
  int64 created_at = 6;
  int64 updated_at = 7;
  bool is_edited = 8;
  repeated Reaction reactions = 9;
}

message SendMessageRequest {
  string receiver_id = 1;  // User ID or Channel ID
  string content = 2;
  string reply_to_id = 3;
}

message SendMessageResponse {
  bool success = 1;
  Message message = 2;
  string error = 3;
}
```

### Server & Channels

```protobuf
message ServerEvent {
  string server_id = 1;
  string channel_id = 2;
}

message JoinServerRequest {
  string server_id = 1;
}

message JoinChannelRequest {
  string channel_id = 1;
}

message ServerMessage {
  string id = 1;
  string server_id = 2;
  string channel_id = 3;
  string sender_id = 4;
  string content = 5;
  // ... mentions handled by client parsing of content
}
```

---

## 4. Event Reference

### 4.1 Chat (Direct Messages)

| Event Enum | Request Proto | Response Proto | Description |
| :--- | :--- | :--- | :--- |
| `CHAT_SEND` | `SendMessageRequest` | `SendMessageResponse` | Send a DM. |
| `CHAT_TYPING` | `TypingIndicator` | N/A | Signal typing status. |
| `CHAT_MARK_READ`| `MarkReadRequest` | `MarkReadResponse` | Mark DM conversation as read. |
| `CHAT_EDIT` | `EditMessageRequest` | `EditMessageResponse` | Edit a previously sent message. |
| `CHAT_DELETE` | `DeleteMessageRequest`| `DeleteMessageResponse` | Delete a message. |

### 4.2 Server (Channels) Subscription Model

> **Important**: The "Join" and "Leave" actions below correspond to **Event Subscriptions**. 
> *   **Joining a Server**: Subscribes the socket to that server's room to receive real-time updates (messages, member changes) for that server.
> *   **Joining a Channel**: Subscribes to granular ephemeral events like "typing indicators" for that channel.

| Event Enum | Request Proto | Response Proto | Description |
| :--- | :--- | :--- | :--- |
| `SERVER_JOIN` | `JoinServerRequest` | `StatusResponse` | **Subscribe** to server-wide real-time events. |
| `SERVER_LEAVE` | `LeaveServerRequest` | `StatusResponse` | **Unsubscribe** from server events. |
| `CHANNEL_JOIN` | `JoinChannelRequest` | `StatusResponse` | **Subscribe** to channel ephemeral events (e.g. typing).|
| `CHANNEL_LEAVE`| `LeaveChannelRequest`| `StatusResponse` | **Unsubscribe** from channel events. |
| `SERVER_SEND` | `SendMessageRequest` | `SendMessageResponse` | Send message to a channel. |

### 4.3 Presence & Status

| Event Enum | Request Proto | Response Proto | Description |
| :--- | :--- | :--- | :--- |
| `PRESENCE_SUB` | `SubscribeRequest` | N/A | Subscribe to user online/offline status. |
| `STATUS_SET` | `SetStatusRequest` | `StatusResponse` | Update own custom status. |

---

## 5. Client Implementation Guide

### 1. Connection Setup
Using the `ws` library or standard browser `WebSocket`:

```typescript
const ws = new WebSocket('ws://api.serchat.io/ws?token=' + jwt);
```

### 2. Message Encoding
All payloads must be wrapped in `WebSocketFrame` using the `EventType` enum.

```typescript
import { WebSocketFrame, EventType, SendMessageRequest } from './proto/compiled';

function sendChatMessage(text: string, receiverId: string) {
  // 1. Create specific payload
  const msgReq = SendMessageRequest.create({
    content: text,
    receiverId: receiverId
  });
  const payloadBytes = SendMessageRequest.encode(msgReq).finish();

  // 2. Wrap in Frame with Enum Event
  const frame = WebSocketFrame.create({
    type: WebSocketFrame.Type.REQUEST,
    id: uuid(),
    event: EventType.CHAT_SEND, // Using Enum
    payload: payloadBytes
  });

  const buffer = WebSocketFrame.encode(frame).finish();
  ws.send(buffer);
}
```

### 3. Message Decoding
```typescript
ws.onmessage = (event) => {
  const buffer = new Uint8Array(event.data);
  const frame = WebSocketFrame.decode(buffer);

  switch(frame.event) {
    case EventType.CHAT_MESSAGE:
      const msg = Message.decode(frame.payload);
      handleNewMessage(msg);
      break;
    
    case EventType.SERVER_MESSAGE:
      // ...
      break;
  }
};
```

---

## 6. Error Handling

Errors are returned as `WebSocketFrame` with `Type.ERROR`.

**Error Payload Definition**:
```protobuf
message ErrorPayload {
  string code = 1;     // e.g. "PERMISSION_DENIED"
  string message = 2;  // Human readable
  map<string, string> details = 3;
}
```
