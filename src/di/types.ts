// Dependency Injection Type Identifiers

export const TYPES = {
    // Infrastructure
    Logger: Symbol.for('Logger'),

    TransactionManager: Symbol.for('TransactionManager'),

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
    ExportJobRepository: Symbol.for('ExportJobRepository'),
    ExportService: Symbol.for('ExportService'),

    // Services
    AuthService: Symbol.for('AuthService'),
    PermissionService: Symbol.for('PermissionService'),
    WebPushService: Symbol.for('WebPushService'),
    KlipyService: Symbol.for('KlipyService'),
    LiveKitService: Symbol.for('LiveKitService'),

    PingService: Symbol.for('PingService'),
    MailService: Symbol.for('MailService'),
    MailConfig: Symbol.for('MailConfig'),
    MetricsService: Symbol.for('MetricsService'),
    PasswordResetRepository: Symbol.for('PasswordResetRepository'),
    ServerAuditLogService: Symbol.for('ServerAuditLogService'),
    RedisService: Symbol.for('RedisService'),
    ImageDeliveryService: Symbol.for('ImageDeliveryService'),

    // Application
    ExpressApp: Symbol.for('ExpressApp'),
    WsServer: Symbol.for('WsServer'),
    WsDispatcher: Symbol.for('WsDispatcher'),
    WsController: Symbol.for('WsController'),
    PresenceController: Symbol.for('PresenceController'),
};
