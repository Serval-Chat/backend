import 'reflect-metadata';
import { Container } from 'inversify';
import { TYPES } from '@/di/types';

// Interfaces
import type { ILogger } from '@/di/interfaces/ILogger';
import type { IEventEmitter } from '@/di/interfaces/IEventEmitter';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IBanRepository } from '@/di/interfaces/IBanRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IMessageRepository } from '@/di/interfaces/IMessageRepository';
import type { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import type { IEmojiRepository } from '@/di/interfaces/IEmojiRepository';
import type { IWebhookRepository } from '@/di/interfaces/IWebhookRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IRoleRepository } from '@/di/interfaces/IRoleRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { ICategoryRepository } from '@/di/interfaces/ICategoryRepository';
import type { IServerMessageRepository } from '@/di/interfaces/IServerMessageRepository';
import type { IInviteRepository } from '@/di/interfaces/IInviteRepository';
import type { IServerBanRepository } from '@/di/interfaces/IServerBanRepository';
import type { IServerChannelReadRepository } from '@/di/interfaces/IServerChannelReadRepository';
import type { IPingRepository } from '@/di/interfaces/IPingRepository';
import type { IReactionRepository } from '@/di/interfaces/IReactionRepository';

// Infrastructure implementations
import { WinstonLogger } from '@/infrastructure/WinstonLogger';

// Repository implementations
import { MongooseUserRepository } from '@/infrastructure/repositories/MongooseUserRepository';
import { MongooseBanRepository } from '@/infrastructure/repositories/MongooseBanRepository';
import { MongooseServerRepository } from '@/infrastructure/repositories/MongooseServerRepository';
import { MongooseMessageRepository } from '@/infrastructure/repositories/MongooseMessageRepository';
import { MongooseFriendshipRepository } from '@/infrastructure/repositories/MongooseFriendshipRepository';
import { MongooseEmojiRepository } from '@/infrastructure/repositories/MongooseEmojiRepository';
import { MongooseWebhookRepository } from '@/infrastructure/repositories/MongooseWebhookRepository';
import { MongooseServerMemberRepository } from '@/infrastructure/repositories/MongooseServerMemberRepository';
import { MongooseRoleRepository } from '@/infrastructure/repositories/MongooseRoleRepository';
import type { IDmUnreadRepository } from '@/di/interfaces/IDmUnreadRepository';
import { MongooseDmUnreadRepository } from '@/infrastructure/repositories/MongooseDmUnreadRepository';
import type { IWarningRepository } from '@/di/interfaces/IWarningRepository';
import { MongooseWarningRepository } from '@/infrastructure/repositories/MongooseWarningRepository';
import { MongooseChannelRepository } from '@/infrastructure/repositories/MongooseChannelRepository';
import { MongooseCategoryRepository } from '@/infrastructure/repositories/MongooseCategoryRepository';
import { MongooseServerMessageRepository } from '@/infrastructure/repositories/MongooseServerMessageRepository';
import type { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import { MongooseAuditLogRepository } from '@/infrastructure/repositories/MongooseAuditLogRepository';
import { MongooseInviteRepository } from '@/infrastructure/repositories/MongooseInviteRepository';
import { MongooseServerBanRepository } from '@/infrastructure/repositories/MongooseServerBanRepository';
import { MongooseServerChannelReadRepository } from '@/infrastructure/repositories/MongooseServerChannelReadRepository';
import { MongoosePingRepository } from '@/infrastructure/repositories/MongoosePingRepository';
import { MongooseReactionRepository } from '@/infrastructure/repositories/MongooseReactionRepository';

// Services
import { AuthService } from '@/services/AuthService';
import { PermissionService } from '@/services/PermissionService';
import { PresenceService } from '@/realtime/services/PresenceService';
import { StatusService } from '@/realtime/services/StatusService';
import { PingService } from '@/services/PingService';
import { AdminController } from '@/controllers/AdminController';
import { AuthController } from '@/controllers/AuthController';
import { FileController } from '@/controllers/FileController';
import { ProfileController } from '@/controllers/ProfileController';
import { SettingsController } from '@/controllers/SettingsController';
import { FriendshipController } from '@/controllers/FriendshipController';
import { UserMessageController } from '@/controllers/UserMessageController';
import { EmojiController } from '@/controllers/EmojiController';
import { ReactionController } from '@/controllers/ReactionController';
import { SystemController } from '@/controllers/SystemController';
import { ServerController } from '@/controllers/ServerController';
import { ServerChannelController } from '@/controllers/ServerChannelController';
import { ServerMemberController } from '@/controllers/ServerMemberController';
import { ServerRoleController } from '@/controllers/ServerRoleController';
import { ServerInviteController } from '@/controllers/ServerInviteController';
import { ServerMessageController } from '@/controllers/ServerMessageController';
import { ServerEmojiController } from '@/controllers/ServerEmojiController';
import { WebhookController } from '@/controllers/WebhookController';
import { MetricsController } from '@/controllers/MetricsController';
import { FileProxyController } from '@/controllers/FileProxyController';
import { ServerPublicController } from '@/controllers/ServerPublicController';
import { UserWarningController } from '@/controllers/UserWarningController';
import { UserPingController } from '@/controllers/UserPingController';
import { FileCompatibilityController } from '@/controllers/FileCompatibilityController';

// Dependency Injection Container
//
// Central container for managing all application dependencies
// Configured during application startup in main.ts
//
// Strategy:
// - Singleton: Core infrastructure and services that maintain state or are expensive to create
// - Transient: Repositories and controllers that should be fresh for each request/use
const container = new Container();

// ====================
// Infrastructure Layer
// ====================

container.bind<ILogger>(TYPES.Logger).to(WinstonLogger).inSingletonScope();

// ==================
// Repository Layer
// ==================

container
    .bind<IUserRepository>(TYPES.UserRepository)
    .to(MongooseUserRepository)
    .inTransientScope();

container
    .bind<IBanRepository>(TYPES.BanRepository)
    .to(MongooseBanRepository)
    .inTransientScope();

container
    .bind<IServerRepository>(TYPES.ServerRepository)
    .to(MongooseServerRepository)
    .inTransientScope();

container
    .bind<IMessageRepository>(TYPES.MessageRepository)
    .to(MongooseMessageRepository)
    .inTransientScope();

container
    .bind<IFriendshipRepository>(TYPES.FriendshipRepository)
    .to(MongooseFriendshipRepository)
    .inTransientScope();

container
    .bind<IEmojiRepository>(TYPES.EmojiRepository)
    .to(MongooseEmojiRepository)
    .inTransientScope();

container
    .bind<IWebhookRepository>(TYPES.WebhookRepository)
    .to(MongooseWebhookRepository)
    .inTransientScope();

container
    .bind<IServerMemberRepository>(TYPES.ServerMemberRepository)
    .to(MongooseServerMemberRepository)
    .inTransientScope();

container
    .bind<IRoleRepository>(TYPES.RoleRepository)
    .to(MongooseRoleRepository)
    .inTransientScope();

container
    .bind<IDmUnreadRepository>(TYPES.DmUnreadRepository)
    .to(MongooseDmUnreadRepository)
    .inTransientScope();

container
    .bind<IWarningRepository>(TYPES.WarningRepository)
    .to(MongooseWarningRepository)
    .inTransientScope();

container
    .bind<IChannelRepository>(TYPES.ChannelRepository)
    .to(MongooseChannelRepository)
    .inTransientScope();

container
    .bind<ICategoryRepository>(TYPES.CategoryRepository)
    .to(MongooseCategoryRepository)
    .inTransientScope();

container
    .bind<IServerMessageRepository>(TYPES.ServerMessageRepository)
    .to(MongooseServerMessageRepository)
    .inTransientScope();

container
    .bind<IAuditLogRepository>(TYPES.AuditLogRepository)
    .to(MongooseAuditLogRepository)
    .inTransientScope();

container
    .bind<IInviteRepository>(TYPES.InviteRepository)
    .to(MongooseInviteRepository)
    .inTransientScope();

container
    .bind<IServerBanRepository>(TYPES.ServerBanRepository)
    .to(MongooseServerBanRepository)
    .inTransientScope();

container
    .bind<IServerChannelReadRepository>(TYPES.ServerChannelReadRepository)
    .to(MongooseServerChannelReadRepository)
    .inTransientScope();

container
    .bind<IPingRepository>(TYPES.PingRepository)
    .to(MongoosePingRepository)
    .inTransientScope();

container
    .bind<IReactionRepository>(TYPES.ReactionRepository)
    .to(MongooseReactionRepository)
    .inTransientScope();

// ===============
// Service Layer
// ===============

container
    .bind<AuthService>(TYPES.AuthService)
    .to(AuthService)
    .inTransientScope();

container
    .bind<PermissionService>(TYPES.PermissionService)
    .to(PermissionService)
    .inTransientScope();

container
    .bind<PresenceService>(TYPES.PresenceService)
    .to(PresenceService)
    .inSingletonScope();

container
    .bind<StatusService>(TYPES.StatusService)
    .to(StatusService)
    .inSingletonScope();

container
    .bind<PingService>(TYPES.PingService)
    .to(PingService)
    .inTransientScope();

container.bind<AdminController>(AdminController).toSelf().inTransientScope();

container.bind<AuthController>(AuthController).toSelf().inTransientScope();

container.bind<FileController>(FileController).toSelf().inTransientScope();

container
    .bind<ProfileController>(ProfileController)
    .toSelf()
    .inTransientScope();

container
    .bind<SettingsController>(SettingsController)
    .toSelf()
    .inTransientScope();

container
    .bind<FriendshipController>(FriendshipController)
    .toSelf()
    .inTransientScope();

container
    .bind<UserMessageController>(UserMessageController)
    .toSelf()
    .inTransientScope();

container.bind<EmojiController>(EmojiController).toSelf().inTransientScope();

container
    .bind<ReactionController>(ReactionController)
    .toSelf()
    .inTransientScope();

container.bind<SystemController>(SystemController).toSelf().inTransientScope();

container.bind<ServerController>(ServerController).toSelf().inTransientScope();

container
    .bind<ServerChannelController>(ServerChannelController)
    .toSelf()
    .inTransientScope();

container
    .bind<ServerMemberController>(ServerMemberController)
    .toSelf()
    .inTransientScope();

container
    .bind<ServerRoleController>(ServerRoleController)
    .toSelf()
    .inTransientScope();

container
    .bind<ServerInviteController>(ServerInviteController)
    .toSelf()
    .inTransientScope();

container
    .bind<ServerMessageController>(ServerMessageController)
    .toSelf()
    .inTransientScope();

container
    .bind<ServerEmojiController>(ServerEmojiController)
    .toSelf()
    .inTransientScope();

container
    .bind<WebhookController>(WebhookController)
    .toSelf()
    .inTransientScope();

container
    .bind<MetricsController>(MetricsController)
    .toSelf()
    .inTransientScope();

container
    .bind<FileProxyController>(FileProxyController)
    .toSelf()
    .inTransientScope();

container
    .bind<ServerPublicController>(ServerPublicController)
    .toSelf()
    .inTransientScope();

container
    .bind<UserWarningController>(UserWarningController)
    .toSelf()
    .inTransientScope();

container
    .bind<UserPingController>(UserPingController)
    .toSelf()
    .inTransientScope();

container
    .bind<FileCompatibilityController>(FileCompatibilityController)
    .toSelf()
    .inTransientScope();

export { container };
