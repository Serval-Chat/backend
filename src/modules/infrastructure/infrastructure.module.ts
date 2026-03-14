import { Global, Module } from '@nestjs/common';
import { TYPES } from '@/di/types';
import { WinstonLogger } from '@/infrastructure/WinstonLogger';
import { WsServer } from '@/ws/server';
import { container } from '@/di/container';

@Global()
@Module({
    providers: [
        {
            provide: TYPES.Logger,
            useClass: WinstonLogger,
        },
        {
            provide: TYPES.WsServer,
            useFactory: () => container.get<WsServer>(TYPES.WsServer),
        },
    ],
    exports: [TYPES.Logger, TYPES.WsServer],
})
export class InfrastructureModule {}
