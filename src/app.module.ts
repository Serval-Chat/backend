import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MONGO_URI } from '@/config/env';
import { DatabaseModule } from './modules/database/database.module';
import { RepositoryModule } from './modules/repository/repository.module';
import { InfrastructureModule } from './modules/infrastructure/infrastructure.module';
import { ServicesModule } from './modules/services/services.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthController } from './controllers/AuthController';
import { AdminController } from './controllers/AdminController';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        MongooseModule.forRoot(MONGO_URI),
        DatabaseModule,
        RepositoryModule,
        InfrastructureModule,
        ServicesModule,
        AuthModule,
    ],
    controllers: [AuthController, AdminController],
    providers: [],
})
export class AppModule { }
