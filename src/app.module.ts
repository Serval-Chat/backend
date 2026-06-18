import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { LoggerModule } from 'nestjs-pino';
import { trace } from '@opentelemetry/api';
import { MONGO_URI } from '@/config/env';
import { LOKI_HOST, LOG_LEVEL, PROJECT_LEVEL } from '@/config/env';
import { DatabaseModule } from './modules/database/database.module';
import { RepositoryModule } from './modules/repository/repository.module';
import { InfrastructureModule } from './modules/infrastructure/infrastructure.module';
import { ServicesModule } from './modules/services/services.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthController } from './controllers/AuthController';
import { BlockController } from './controllers/BlockController';
import { AdminController } from './controllers/AdminController';
import { AdminBadgeController } from './controllers/AdminBadgeController';
import { AdminInviteController } from './controllers/AdminInviteController';
import { UserPingController } from './controllers/UserPingController';
import { ExportController } from './controllers/ExportController';
import { UserWarningController } from './controllers/UserWarningController';
import { ApiErrorFilter } from './filters/ApiErrorFilter';
import { IdResponseInterceptor } from './interceptors/IdResponseInterceptor';
import { EmojiController } from './controllers/EmojiController';
import { FileController } from './controllers/FileController';
import { FileCompatibilityController } from './controllers/FileCompatibilityController';
import { NotificationSoundController } from './controllers/NotificationSoundController';

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
import { ServerStickerController } from './controllers/ServerStickerController';
import { StickerController } from './controllers/StickerController';
import { ServerMessageController } from './controllers/ServerMessageController';
import { ServerMessageSearchController } from './controllers/ServerMessageSearchController';
import { UserMessageSearchController } from './controllers/UserMessageSearchController';
import { ServerPublicController } from './controllers/ServerPublicController';
import { ServerDiscoveryController } from './controllers/ServerDiscoveryController';
import { SystemController } from './controllers/SystemController';
import { UserMessageController } from './controllers/UserMessageController';
import { SettingsController } from './controllers/SettingsController';
import { PushController } from './controllers/PushController';
import { KlipyController } from './controllers/KlipyController';
import { ServerAuditLogController } from './controllers/ServerAuditLogController';
import { BotController } from './controllers/BotController';
import { WebhookController } from './controllers/WebhookController';
import { EmbedController } from './controllers/EmbedController';
import { InteractionController } from './controllers/InteractionController';
import { ApplicationController } from './controllers/ApplicationController';
import {
    botTokenLimiter,
    discoverySearchLimiter,
    discoverySettingsLimiter,
    loginLimiter,
    messageSearchLimiter,
    passwordResetLimiter,
    registrationLimiter,
    sensitiveOperationLimiter,
    websiteConnectionCreateLimiter,
    websiteConnectionRemoveLimiter,
    websiteConnectionVerifyLimiter,
    webhookExecutionLimiter,
} from './middleware/rateLimiting';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        MongooseModule.forRootAsync({
            useFactory: () => ({
                uri:
                    process.env.MONGO_URI !== undefined &&
                    process.env.MONGO_URI !== ''
                        ? process.env.MONGO_URI
                        : MONGO_URI,
            }),
        }),

        LoggerModule.forRoot({
            pinoHttp: {
                autoLogging: false,
                level: LOG_LEVEL,
                customProps: () => {
                    const span = trace.getActiveSpan();
                    const ctx = span?.spanContext();
                    return ctx
                        ? { trace_id: ctx.traceId, span_id: ctx.spanId }
                        : {};
                },
                transport:
                    PROJECT_LEVEL !== 'production'
                        ? { target: 'pino-pretty' }
                        : {
                              targets: [
                                  {
                                      target: 'pino-pretty',
                                      options: { colorize: false },
                                      level: LOG_LEVEL,
                                  },
                                  {
                                      target: 'pino-loki',
                                      options: {
                                          host: LOKI_HOST,
                                          labels: {
                                              app: 'serval-backend',
                                              env: 'production',
                                          },
                                          batching: true,
                                          interval: 5,
                                          silenceErrors: true,
                                      },
                                      level: 'info',
                                  },
                              ],
                          },
            },
        }),

        DatabaseModule,
        RepositoryModule,
        InfrastructureModule,
        ServicesModule,
        AuthModule,
    ],
    controllers: [
        AuthController,
        BlockController,
        AdminController,
        AdminBadgeController,
        AdminInviteController,
        UserPingController,
        UserWarningController,
        EmojiController,
        FileController,
        FileCompatibilityController,
        NotificationSoundController,

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
        ServerStickerController,
        StickerController,
        ServerMessageSearchController,
        ServerMessageController,
        ServerPublicController,
        ServerDiscoveryController,
        SystemController,
        UserMessageSearchController,
        UserMessageController,
        SettingsController,
        PushController,
        ExportController,
        KlipyController,
        ServerAuditLogController,
        BotController,
        WebhookController,
        EmbedController,
        InteractionController,
        ApplicationController,
    ],
    providers: [
        {
            provide: APP_FILTER,
            useClass: ApiErrorFilter,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: IdResponseInterceptor,
        },
    ],
})
export class AppModule {
    public configure(consumer: MiddlewareConsumer) {
        consumer.apply(loginLimiter).forRoutes({
            path: 'api/v1/auth/login',
            method: RequestMethod.POST,
        });

        consumer.apply(registrationLimiter).forRoutes({
            path: 'api/v1/auth/register',
            method: RequestMethod.POST,
        });

        consumer.apply(passwordResetLimiter).forRoutes({
            path: 'api/v1/auth/password/reset',
            method: RequestMethod.POST,
        });

        consumer.apply(botTokenLimiter).forRoutes({
            path: 'api/v1/bots/token',
            method: RequestMethod.POST,
        });

        consumer.apply(webhookExecutionLimiter).forRoutes({
            path: 'api/v1/webhooks/:token',
            method: RequestMethod.POST,
        });

        consumer.apply(messageSearchLimiter).forRoutes(
            {
                path: 'api/v1/messages/search',
                method: RequestMethod.GET,
            },
            {
                path: 'api/v1/servers/:serverId/channels/:channelId/messages/search',
                method: RequestMethod.GET,
            },
        );

        consumer.apply(discoverySearchLimiter).forRoutes({
            path: 'api/v1/discovery/servers',
            method: RequestMethod.GET,
        });

        consumer.apply(discoverySettingsLimiter).forRoutes({
            path: 'api/v1/servers/:serverId',
            method: RequestMethod.PATCH,
        });

        consumer.apply(websiteConnectionCreateLimiter).forRoutes({
            path: 'api/v1/profile/connections/website',
            method: RequestMethod.POST,
        });

        consumer.apply(websiteConnectionVerifyLimiter).forRoutes({
            path: 'api/v1/profile/connections/:connectionId/verify',
            method: RequestMethod.POST,
        });

        consumer.apply(websiteConnectionRemoveLimiter).forRoutes({
            path: 'api/v1/profile/connections/:connectionId',
            method: RequestMethod.DELETE,
        });

        consumer.apply(sensitiveOperationLimiter).forRoutes(
            {
                path: 'api/v1/auth/login',
                method: RequestMethod.PATCH,
            },
            {
                path: 'api/v1/auth/password',
                method: RequestMethod.PATCH,
            },
            {
                path: 'api/v1/auth/2fa/verify',
                method: RequestMethod.POST,
            },
            {
                path: 'api/v1/auth/2fa/backup-codes/regenerate',
                method: RequestMethod.POST,
            },
            {
                path: 'api/v1/auth/2fa/disable',
                method: RequestMethod.POST,
            },
        );
    }
}
