export enum EventType {
    UNKNOWN = 0,

    // Chat (Direct Messages)
    CHAT_SEND = 10,
    CHAT_MESSAGE = 11, // Incoming DM
    CHAT_TYPING = 12,
    CHAT_MARK_READ = 13,
    CHAT_EDIT = 14,
    CHAT_DELETE = 15,
    CHAT_MESSAGE_EDITED = 16,
    CHAT_MESSAGE_DELETED = 17,
    DM_UNREAD_UPDATE = 18, // DM unread count change

    // Server (Channel) Subscription & Actions
    SERVER_JOIN = 20, // Subscribe to server events
    SERVER_LEAVE = 21, // Unsubscribe from server events
    CHANNEL_JOIN = 22, // Subscribe to channel (typing, focus)
    CHANNEL_LEAVE = 23, // Unsubscribe from channel
    SERVER_SEND = 24, // Send message to channel
    SERVER_MESSAGE = 25, // Incoming server message
    SERVER_TYPING = 26, // Incoming typing indicator
    SERVER_EDIT = 27,
    SERVER_DELETE = 28,
    SERVER_MESSAGE_EDITED = 29,
    SERVER_MESSAGE_DELETED = 30,
    CHANNEL_MARK_READ = 31,
    CHANNEL_UNREAD_UPDATE = 32,

    // Presence & Status
    PRESENCE_SYNC = 40, // Initial state sync (all online users)
    PRESENCE_UPDATE = 41, // Incoming presence update (online/offline)
    STATUS_SET = 42, // Set own status
    STATUS_SUB = 43, // Subscribe to specific users status
    STATUS_UNSUB = 44, // Unsubscribe from status
    STATUS_UPDATE = 45, // Incoming status update

    // Reactions
    REACTION_ADD = 50,
    REACTION_REMOVE = 51,
    REACTION_UPDATED = 52, // Broadcast when reactions on a message change

    // System & Security
    PING_NOTIFICATION = 60, // Mention/Notification (different from WS heartbeat)
    SECURITY_BAN = 61, // User was banned, connection will close

    // Debug & Heartbeat
    DEBUG_PING = 70,
    DEBUG_PONG = 71,
}

export enum FrameType {
    UNKNOWN_TYPE = 0,
    EVENT = 1, // Standard event message
    REQUEST = 2, // Request requiring a response
    RESPONSE = 3, // Response to a request
    ERROR = 4, // Error response
}

export interface WebSocketFrame {
    type: FrameType;
    id?: string; // Request ID (required for REQUEST/RESPONSE)
    event: EventType; // Enum-based event type
    payload: Buffer | Uint8Array; // Serialized inner Protobuf message
}
