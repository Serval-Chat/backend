import { Global, Module } from '@nestjs/common';
import { TYPES } from '@/di/types';
import elasticsearchConfig from '@/config/elasticsearch.json';
import { AuthService } from '@/services/AuthService';
import { PermissionService } from '@/permissions/PermissionService';
import { PingService } from '@/services/PingService';
import { MailService } from '@/services/MailService';
import { ExportService } from '@/services/ExportService';
import { KlipyService } from '@/services/KlipyService';
import { MetricsService } from '@/services/MetricsService';
import { ServerAuditLogService } from '@/services/ServerAuditLogService';
import { LiveKitService } from '@/services/LiveKitService';
import { ImageDeliveryService } from '@/services/ImageDeliveryService';
import { RegistrationInviteService } from '@/services/RegistrationInviteService';
import { ScraperService } from '@/services/ScraperService';
import { EmbedService } from '@/services/EmbedService';
import { ServerVerificationService } from '@/services/ServerVerificationService';
import { ServerDiscoveryService } from '@/services/ServerDiscoveryService';
import { MessageSearchService } from '@/services/MessageSearchService';
import { RepositoryModule } from '@/modules/repository/repository.module';
import { InfrastructureModule } from '@/modules/infrastructure/infrastructure.module';
import { container } from '@/di/container';

const esConfig = elasticsearchConfig as {
    settings: Record<string, unknown>;
    mappings: Record<string, unknown>;
};

@Global()
@Module({
    imports: [RepositoryModule, InfrastructureModule],
    providers: [
        {
            provide: TYPES.AuthService,
            useClass: AuthService,
        },
        {
            provide: TYPES.PermissionService,
            useFactory: () =>
                container.get<PermissionService>(TYPES.PermissionService),
        },
        {
            provide: TYPES.PingService,
            useClass: PingService,
        },
        {
            provide: TYPES.MailService,
            useClass: MailService,
        },
        {
            provide: TYPES.MailConfig,
            useValue: { skipSending: process.env.NODE_ENV === 'test' },
        },
        {
            provide: TYPES.MetricsService,
            useClass: MetricsService,
        },
        {
            provide: TYPES.ExportService,
            useClass: ExportService,
        },
        {
            provide: TYPES.KlipyService,
            useClass: KlipyService,
        },
        {
            provide: TYPES.LiveKitService,
            useClass: LiveKitService,
        },
        {
            provide: TYPES.ServerAuditLogService,
            useClass: ServerAuditLogService,
        },
        {
            provide: TYPES.ImageDeliveryService,
            useClass: ImageDeliveryService,
        },
        {
            provide: TYPES.RegistrationInviteService,
            useClass: RegistrationInviteService,
        },
        {
            provide: TYPES.ScraperService,
            useClass: ScraperService,
        },
        {
            provide: TYPES.EmbedService,
            useClass: EmbedService,
        },
        {
            provide: TYPES.ServerVerificationService,
            useClass: ServerVerificationService,
        },
        {
            provide: TYPES.ServerDiscoveryService,
            useClass: ServerDiscoveryService,
        },
        {
            provide: TYPES.MessageSearchService,
            useFactory: () =>
                container.get<MessageSearchService>(TYPES.MessageSearchService),
        },
        {
            provide: TYPES.ElasticsearchConfig,
            useValue: esConfig,
        },
    ],
    exports: [
        TYPES.AuthService,
        TYPES.PermissionService,
        TYPES.PingService,
        TYPES.MailService,
        TYPES.MetricsService,
        TYPES.ExportService,
        TYPES.KlipyService,
        TYPES.LiveKitService,
        TYPES.ServerAuditLogService,
        TYPES.ImageDeliveryService,
        TYPES.RegistrationInviteService,
        TYPES.ScraperService,
        TYPES.EmbedService,
        TYPES.ServerVerificationService,
        TYPES.ServerDiscoveryService,
        TYPES.MessageSearchService,
        TYPES.ElasticsearchConfig,
    ],
})
export class ServicesModule {}
