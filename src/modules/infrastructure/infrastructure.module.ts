import { Global, Module } from '@nestjs/common';
import { TYPES } from '@/di/types';
import { WinstonLogger } from '@/infrastructure/WinstonLogger';

@Global()
@Module({
    providers: [
        {
            provide: TYPES.Logger,
            useClass: WinstonLogger,
        },
    ],
    exports: [TYPES.Logger],
})
export class InfrastructureModule {}
