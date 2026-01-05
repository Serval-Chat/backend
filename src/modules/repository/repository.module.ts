import { Global, Module } from '@nestjs/common';
import { TYPES } from '@/di/types';
import { MongooseUserRepository } from '@/infrastructure/repositories/MongooseUserRepository';
import { MongooseBanRepository } from '@/infrastructure/repositories/MongooseBanRepository';
import { MongooseAuditLogRepository } from '@/infrastructure/repositories/MongooseAuditLogRepository';
import { MongooseFriendshipRepository } from '@/infrastructure/repositories/MongooseFriendshipRepository';
import { MongooseServerRepository } from '@/infrastructure/repositories/MongooseServerRepository';
import { MongooseMessageRepository } from '@/infrastructure/repositories/MongooseMessageRepository';
import { MongooseWarningRepository } from '@/infrastructure/repositories/MongooseWarningRepository';
import { MongooseServerMemberRepository } from '@/infrastructure/repositories/MongooseServerMemberRepository';
import { MongooseRoleRepository } from '@/infrastructure/repositories/MongooseRoleRepository';
import { MongooseCategoryRepository } from '@/infrastructure/repositories/MongooseCategoryRepository';
import { MongooseChannelRepository } from '@/infrastructure/repositories/MongooseChannelRepository';
import { MongoosePingRepository } from '@/infrastructure/repositories/MongoosePingRepository';
import { MongooseEmojiRepository } from '@/infrastructure/repositories/MongooseEmojiRepository';
import { MongooseReactionRepository } from '@/infrastructure/repositories/MongooseReactionRepository';
import { MongooseServerMessageRepository } from '@/infrastructure/repositories/MongooseServerMessageRepository';
import { MongooseInviteRepository } from '@/infrastructure/repositories/MongooseInviteRepository';
import { MongooseServerBanRepository } from '@/infrastructure/repositories/MongooseServerBanRepository';
import { MongooseServerChannelReadRepository } from '@/infrastructure/repositories/MongooseServerChannelReadRepository';
import { MongooseDmUnreadRepository } from '@/infrastructure/repositories/MongooseDmUnreadRepository';
import { MongooseWebhookRepository } from '@/infrastructure/repositories/MongooseWebhookRepository';

@Global()
@Module({
    providers: [
        {
            provide: TYPES.UserRepository,
            useClass: MongooseUserRepository,
        },
        {
            provide: TYPES.BanRepository,
            useClass: MongooseBanRepository,
        },
        {
            provide: TYPES.AuditLogRepository,
            useClass: MongooseAuditLogRepository,
        },
        {
            provide: TYPES.FriendshipRepository,
            useClass: MongooseFriendshipRepository,
        },
        {
            provide: TYPES.ServerRepository,
            useClass: MongooseServerRepository,
        },
        {
            provide: TYPES.MessageRepository,
            useClass: MongooseMessageRepository,
        },
        {
            provide: TYPES.WarningRepository,
            useClass: MongooseWarningRepository,
        },
        {
            provide: TYPES.ServerMemberRepository,
            useClass: MongooseServerMemberRepository,
        },
        {
            provide: TYPES.RoleRepository,
            useClass: MongooseRoleRepository,
        },
        {
            provide: TYPES.CategoryRepository,
            useClass: MongooseCategoryRepository,
        },
        {
            provide: TYPES.ChannelRepository,
            useClass: MongooseChannelRepository,
        },
        {
            provide: TYPES.PingRepository,
            useClass: MongoosePingRepository,
        },
        {
            provide: TYPES.EmojiRepository,
            useClass: MongooseEmojiRepository,
        },
        {
            provide: TYPES.ReactionRepository,
            useClass: MongooseReactionRepository,
        },
        {
            provide: TYPES.ServerMessageRepository,
            useClass: MongooseServerMessageRepository,
        },
        {
            provide: TYPES.InviteRepository,
            useClass: MongooseInviteRepository,
        },
        {
            provide: TYPES.ServerBanRepository,
            useClass: MongooseServerBanRepository,
        },
        {
            provide: TYPES.ServerChannelReadRepository,
            useClass: MongooseServerChannelReadRepository,
        },
        {
            provide: TYPES.DmUnreadRepository,
            useClass: MongooseDmUnreadRepository,
        },
        {
            provide: TYPES.WebhookRepository,
            useClass: MongooseWebhookRepository,
        },
    ],
    exports: [
        TYPES.UserRepository,
        TYPES.BanRepository,
        TYPES.AuditLogRepository,
        TYPES.FriendshipRepository,
        TYPES.ServerRepository,
        TYPES.MessageRepository,
        TYPES.WarningRepository,
        TYPES.ServerMemberRepository,
        TYPES.RoleRepository,
        TYPES.CategoryRepository,
        TYPES.ChannelRepository,
        TYPES.PingRepository,
        TYPES.EmojiRepository,
        TYPES.ReactionRepository,
        TYPES.ServerMessageRepository,
        TYPES.InviteRepository,
        TYPES.ServerBanRepository,
        TYPES.ServerChannelReadRepository,
        TYPES.DmUnreadRepository,
        TYPES.WebhookRepository,
    ],
})
export class RepositoryModule {}
