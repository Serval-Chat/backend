// Dependency Injection Type Identifiers
//
// Symbols used to identify and resolve dependencies in the InversifyJS container

export const TYPES = {
    // Infrastructure
    Logger: Symbol.for('Logger'),
    EventEmitter: Symbol.for('EventEmitter'),

    // Repositories
    UserRepository: Symbol.for('UserRepository'),
    ServerRepository: Symbol.for('ServerRepository'),
    MessageRepository: Symbol.for('MessageRepository'),
    BanRepository: Symbol.for('BanRepository'),
    ServerMemberRepository: Symbol.for('ServerMemberRepository'),
    RoleRepository: Symbol.for('RoleRepository'),
    DmUnreadRepository: Symbol.for('DmUnreadRepository'),
    WarningRepository: Symbol.for('WarningRepository'),
    FriendshipRepository: Symbol.for('FriendshipRepository'),
    EmojiRepository: Symbol.for('EmojiRepository'),
    WebhookRepository: Symbol.for('WebhookRepository'),
    ChannelRepository: Symbol.for('ChannelRepository'),
    CategoryRepository: Symbol.for('CategoryRepository'),
    ServerMessageRepository: Symbol.for('ServerMessageRepository'),
    AuditLogRepository: Symbol.for('AuditLogRepository'),
    InviteRepository: Symbol.for('InviteRepository'),
    ServerBanRepository: Symbol.for('ServerBanRepository'),
    ServerChannelReadRepository: Symbol.for('ServerChannelReadRepository'),
    PingRepository: Symbol.for('PingRepository'),
    ReactionRepository: Symbol.for('ReactionRepository'),

    // Services
    AuthService: Symbol.for('AuthService'),
    PermissionService: Symbol.for('PermissionService'),
    WebPushService: Symbol.for('WebPushService'),
    PresenceService: Symbol.for('PresenceService'),
    StatusService: Symbol.for('StatusService'),
    PingService: Symbol.for('PingService'),

    // Application
    ExpressApp: Symbol.for('ExpressApp'),
};
