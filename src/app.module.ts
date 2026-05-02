import { Module, MiddlewareConsumer } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
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
import { UserPingController } from './controllers/UserPingController';
import { ExportController } from './controllers/ExportController';
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
import { PushController } from './controllers/PushController';
import { KlipyController } from './controllers/KlipyController';
import { ServerAuditLogController } from './controllers/ServerAuditLogController';
import { BotController } from './controllers/BotController';
import { WebhookController } from './controllers/WebhookController';
import { InteractionController } from './controllers/InteractionController';
import { ApplicationController } from './controllers/ApplicationController';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        MongooseModule.forRoot(MONGO_URI),

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
        PushController,
        ExportController,
        KlipyController,
        ServerAuditLogController,
        BotController,
        WebhookController,
        InteractionController,
        ApplicationController,
    ],
    providers: [
        {
            provide: APP_FILTER,
            useClass: ApiErrorFilter,
        },
    ],
})
export class AppModule {
    public configure(_consumer: MiddlewareConsumer) { }
}
