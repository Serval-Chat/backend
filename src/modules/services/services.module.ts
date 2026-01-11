import { Global, Module } from '@nestjs/common';
import { TYPES } from '@/di/types';
import { AuthService } from '@/services/AuthService';
import { PermissionService } from '@/services/PermissionService';
import { PingService } from '@/services/PingService';

@Global()
@Module({
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
    ],
    exports: [TYPES.AuthService, TYPES.PermissionService, TYPES.PingService],
})
export class ServicesModule { }
