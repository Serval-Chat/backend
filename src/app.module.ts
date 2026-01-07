import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MONGO_URI } from '@/config/env';
import { DatabaseModule } from './modules/database/database.module';
import { RepositoryModule } from './modules/repository/repository.module';
import { InfrastructureModule } from './modules/infrastructure/infrastructure.module';
import { ServicesModule } from './modules/services/services.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthController } from './controllers/AuthController';
import { AdminController } from './controllers/AdminController';
import { UserPingController } from './controllers/UserPingController';
import { UserWarningController } from './controllers/UserWarningController';
import { ApiErrorFilter } from './filters/ApiErrorFilter';
import { EmojiController } from './controllers/EmojiController';
import { FileController } from './controllers/FileController';
import { FileCompatibilityController } from './controllers/FileCompatibilityController';
import { FileProxyController } from './controllers/FileProxyController';
import { FriendshipController } from './controllers/FriendshipController';
import { MetricsController } from './controllers/MetricsController';
import { ProfileController } from './controllers/ProfileController';
import { ReactionController } from './controllers/ReactionController';
import { ServerChannelController } from './controllers/ServerChannelController';
import { ServerController } from './controllers/ServerController';
import { ServerMemberController } from './controllers/ServerMemberController';
import { ServerInviteController } from './controllers/ServerInviteController';
import { ServerRoleController } from './controllers/ServerRoleController';
import { ServerEmojiController } from './controllers/ServerEmojiController';
import { ServerMessageController } from './controllers/ServerMessageController';
import { ServerPublicController } from './controllers/ServerPublicController';
import { SystemController } from './controllers/SystemController';
import { UserMessageController } from './controllers/UserMessageController';
import { SettingsController } from './controllers/SettingsController';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        MongooseModule.forRoot(MONGO_URI),
        DatabaseModule,
        RepositoryModule,
        InfrastructureModule,
        ServicesModule,
        AuthModule,
    ],
    controllers: [
        AuthController,
        AdminController,
        UserPingController,
        UserWarningController,
        EmojiController,
        FileController,
        FileCompatibilityController,
        FileProxyController,
        FriendshipController,
        MetricsController,
        ProfileController,
        ReactionController,
        ServerChannelController,
        ServerController,
        ServerMemberController,
        ServerInviteController,
        ServerRoleController,
        ServerEmojiController,
        ServerMessageController,
        ServerPublicController,
        SystemController,
        UserMessageController,
        SettingsController,
    ],
    providers: [
        {
            provide: APP_FILTER,
            useClass: ApiErrorFilter,
        },
    ],
})
export class AppModule {}
