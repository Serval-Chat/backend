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
    ],
})
export class RepositoryModule { }
