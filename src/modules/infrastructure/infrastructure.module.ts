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
        {
            provide: TYPES.RedisService,
            useFactory: () => container.get(TYPES.RedisService),
        },
    ],
    exports: [TYPES.Logger, TYPES.WsServer, TYPES.RedisService],
})
export class InfrastructureModule {}
