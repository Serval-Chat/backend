import { Global, Module } from '@nestjs/common';
import { TYPES } from '@/di/types';
import { MongooseUserRepository } from '@/infrastructure/repositories/MongooseUserRepository';
import { MongooseBanRepository } from '@/infrastructure/repositories/MongooseBanRepository';
import { MongooseMuteRepository } from '@/infrastructure/repositories/MongooseMuteRepository';
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
import { MongooseStickerRepository } from '@/infrastructure/repositories/MongooseStickerRepository';
import { MongooseReactionRepository } from '@/infrastructure/repositories/MongooseReactionRepository';
import { MongooseInviteRepository } from '@/infrastructure/repositories/MongooseInviteRepository';
import { MongooseVanityLinkRepository } from '@/infrastructure/repositories/MongooseVanityLinkRepository';
import { MongooseServerBanRepository } from '@/infrastructure/repositories/MongooseServerBanRepository';
import { MongooseServerChannelReadRepository } from '@/infrastructure/repositories/MongooseServerChannelReadRepository';
import { MongooseChannelReadRepository } from '@/infrastructure/repositories/MongooseChannelReadRepository';
import { MongooseDmUnreadRepository } from '@/infrastructure/repositories/MongooseDmUnreadRepository';
import { MongooseWebhookRepository } from '@/infrastructure/repositories/MongooseWebhookRepository';
import { MongooseExportJobRepository } from '@/infrastructure/repositories/MongooseExportJobRepository';
import { MongoosePasswordResetRepository } from '@/infrastructure/repositories/MongoosePasswordResetRepository';
import { MongooseBlockRepository } from '@/infrastructure/repositories/MongooseBlockRepository';
import { MongooseAdminNoteRepository } from '@/infrastructure/repositories/MongooseAdminNoteRepository';
import { SlashCommandRepository } from '@/infrastructure/repositories/SlashCommandRepository';
import { MongooseSessionRepository } from '@/infrastructure/repositories/MongooseSessionRepository';

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
            provide: TYPES.MuteRepository,
            useClass: MongooseMuteRepository,
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
            provide: TYPES.StickerRepository,
            useClass: MongooseStickerRepository,
        },
        {
            provide: TYPES.ReactionRepository,
            useClass: MongooseReactionRepository,
        },
        {
            provide: TYPES.InviteRepository,
            useClass: MongooseInviteRepository,
        },
        {
            provide: TYPES.VanityLinkRepository,
            useClass: MongooseVanityLinkRepository,
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
            provide: TYPES.ChannelReadRepository,
            useClass: MongooseChannelReadRepository,
        },
        {
            provide: TYPES.DmUnreadRepository,
            useClass: MongooseDmUnreadRepository,
        },
        {
            provide: TYPES.WebhookRepository,
            useClass: MongooseWebhookRepository,
        },
        {
            provide: TYPES.PasswordResetRepository,
            useClass: MongoosePasswordResetRepository,
        },
        {
            provide: TYPES.ExportJobRepository,
            useClass: MongooseExportJobRepository,
        },
        {
            provide: TYPES.BlockRepository,
            useClass: MongooseBlockRepository,
        },
        {
            provide: TYPES.AdminNoteRepository,
            useClass: MongooseAdminNoteRepository,
        },
        {
            provide: TYPES.SlashCommandRepository,
            useClass: SlashCommandRepository,
        },
        {
            provide: TYPES.SessionRepository,
            useClass: MongooseSessionRepository,
        },
    ],
    exports: [
        TYPES.UserRepository,
        TYPES.BanRepository,
        TYPES.MuteRepository,
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
        TYPES.StickerRepository,
        TYPES.ReactionRepository,
        TYPES.InviteRepository,
        TYPES.VanityLinkRepository,
        TYPES.ServerBanRepository,
        TYPES.ServerChannelReadRepository,
        TYPES.ChannelReadRepository,
        TYPES.DmUnreadRepository,
        TYPES.WebhookRepository,
        TYPES.PasswordResetRepository,
        TYPES.ExportJobRepository,
        TYPES.BlockRepository,
        TYPES.AdminNoteRepository,
        TYPES.SlashCommandRepository,
        TYPES.SessionRepository,
    ],
})
export class RepositoryModule {}
