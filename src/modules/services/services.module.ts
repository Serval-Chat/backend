import { Global, Module } from '@nestjs/common';
import { TYPES } from '@/di/types';
import { AuthService } from '@/services/AuthService';
import { PermissionService } from '@/services/PermissionService';
import { PresenceService } from '@/realtime/services/PresenceService';

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
            provide: TYPES.PresenceService,
            useClass: PresenceService,
        },
    ],
    exports: [TYPES.AuthService, TYPES.PermissionService, TYPES.PresenceService],
})
export class ServicesModule { }
