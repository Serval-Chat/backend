import { Global, Module } from '@nestjs/common';
import { TYPES } from '@/di/types';
import { WinstonLogger } from '@/infrastructure/WinstonLogger';
import { SocketIOEmitter } from '@/infrastructure/SocketIOEmitter';

@Global()
@Module({
    providers: [
        {
            provide: TYPES.Logger,
            useClass: WinstonLogger,
        },
        {
            provide: TYPES.EventEmitter,
            useClass: SocketIOEmitter,
        },
    ],
    exports: [TYPES.Logger, TYPES.EventEmitter],
})
export class InfrastructureModule { }
