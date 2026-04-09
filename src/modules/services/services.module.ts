import { Global, Module } from '@nestjs/common';
import { TYPES } from '@/di/types';
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
import { RepositoryModule } from '@/modules/repository/repository.module';
import { InfrastructureModule } from '@/modules/infrastructure/infrastructure.module';

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
            useClass: PermissionService,
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
    ],
})
export class ServicesModule {}
