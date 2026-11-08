import { Global, Module } from '@nestjs/common';
import { TYPES } from '@/di/types';
import { KlipyService } from '@/services/KlipyService';
import { GifTagService } from '@/services/GifTagService';
import { RegistrationInviteService } from '@/services/RegistrationInviteService';
import { GeoIpService } from '@/services/GeoIpService';
import { VpnDetectionService } from '@/services/VpnDetectionService';
import { ServerVerificationService } from '@/services/ServerVerificationService';
import { ServerDiscoveryService } from '@/services/ServerDiscoveryService';
import { RepositoryModule } from '@/modules/repository/repository.module';
import { InfrastructureModule } from '@/modules/infrastructure/infrastructure.module';
import { container } from '@/di/container';

const fromContainer = (token: symbol) => ({
    provide: token,
    useFactory: () => container.get(token),
});

@Global()
@Module({
    imports: [RepositoryModule, InfrastructureModule],
    providers: [
        fromContainer(TYPES.AuthService),
        fromContainer(TYPES.PasskeyService),
        fromContainer(TYPES.PasswordlessService),
        fromContainer(TYPES.PermissionService),
        fromContainer(TYPES.PingService),
        fromContainer(TYPES.MailService),
        fromContainer(TYPES.MailConfig),
        fromContainer(TYPES.MetricsService),
        fromContainer(TYPES.ExportService),
        {
            provide: TYPES.KlipyService,
            useClass: KlipyService,
        },
        {
            provide: TYPES.GifTagService,
            useClass: GifTagService,
        },
        fromContainer(TYPES.ServerAuditLogService),
        fromContainer(TYPES.ImageDeliveryService),
        {
            provide: TYPES.RegistrationInviteService,
            useClass: RegistrationInviteService,
        },
        {
            provide: TYPES.GeoIpService,
            useClass: GeoIpService,
        },
        {
            provide: TYPES.VpnDetectionService,
            useClass: VpnDetectionService,
        },
        fromContainer(TYPES.ScraperService),
        fromContainer(TYPES.EmbedService),
        {
            provide: TYPES.ServerVerificationService,
            useClass: ServerVerificationService,
        },
        {
            provide: TYPES.ServerDiscoveryService,
            useClass: ServerDiscoveryService,
        },
        fromContainer(TYPES.MessageSearchService),
        fromContainer(TYPES.ElasticsearchConfig),
        fromContainer(TYPES.ChannelService),
    ],
    exports: [
        TYPES.AuthService,
        TYPES.PasskeyService,
        TYPES.PasswordlessService,
        TYPES.PermissionService,
        TYPES.PingService,
        TYPES.MailService,
        TYPES.MetricsService,
        TYPES.ExportService,
        TYPES.KlipyService,
        TYPES.GifTagService,
        TYPES.ServerAuditLogService,
        TYPES.ImageDeliveryService,
        TYPES.RegistrationInviteService,
        TYPES.GeoIpService,
        TYPES.VpnDetectionService,
        TYPES.ScraperService,
        TYPES.EmbedService,
        TYPES.ServerVerificationService,
        TYPES.ServerDiscoveryService,
        TYPES.MessageSearchService,
        TYPES.ElasticsearchConfig,
        TYPES.ChannelService,
    ],
})
export class ServicesModule {}
