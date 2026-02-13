import { Global, Module } from '@nestjs/common';
import { TYPES } from '@/di/types';
import { AuthService } from '@/services/AuthService';
import { PermissionService } from '@/services/PermissionService';
import { PingService } from '@/services/PingService';
import { MailService } from '@/services/MailService';
import { MetricsService } from '@/services/MetricsService';
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
    ],
    exports: [
        TYPES.AuthService,
        TYPES.PermissionService,
        TYPES.PingService,
        TYPES.MailService,
        TYPES.MetricsService,
    ],
})
export class ServicesModule {}
