import {
    Controller,
    Inject,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Req,
    UseGuards,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiBearerAuth,
    ApiOkResponse,
} from '@nestjs/swagger';
import {
    PublicKeyResponseDTO,
    VapidStatusResponseDTO,
    SuccessResponseDTO,
    PushPreferencesResponseDTO,
} from './dto/push.response.dto';
import type { Request as ExpressRequest } from 'express';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { AuthGuard } from '@/modules/auth/auth.module';
import { Public } from '@/modules/auth/public.decorator';
import {
    WebPushDto,
    FcmDto,
    UpdatePreferencesDto,
    MigrateVapidDto,
} from './dto/push.request.dto';
import { VAPID_KEY_VERSION, VAPID_PUB } from '@/config/env';
import { TYPES } from '@/di/types';
import type { IPushSubscriptionRepository } from '@/di/interfaces/IPushSubscriptionRepository';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';

@Controller('api/v1/push')
@ApiTags('Push')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class PushController {
    public constructor(
        @Inject(TYPES.PushSubscriptionRepository)
        private pushSubscriptionRepo: IPushSubscriptionRepository,
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
    ) {}

    @Get('vapid-public-key')
    @Public()
    @ApiOperation({ summary: 'Get VAPID public key' })
    @ApiOkResponse({ type: PublicKeyResponseDTO })
    public getVapidKey() {
        return { publicKey: VAPID_PUB };
    }

    @Get('vapid-status')
    @Public()
    @ApiOperation({ summary: 'Get VAPID status' })
    @ApiOkResponse({ type: VapidStatusResponseDTO })
    public vapidStatus() {
        return {
            currentVersion: VAPID_KEY_VERSION,
            currentPublicKey: VAPID_PUB,
        };
    }

    @Post('subscribe/web')
    @ApiOperation({ summary: 'Subscribe to web push' })
    @ApiOkResponse({ type: SuccessResponseDTO })
    public async subscribeWeb(
        @Req() req: ExpressRequest,
        @CurrentUser('id') userId: string,
        @Body() body: WebPushDto,
    ) {
        await this.pushSubscriptionRepo.upsertWebPush({
            userId,
            endpointData: body.subscription,
            vapidKeyVersion: VAPID_KEY_VERSION,
            userAgent: req.headers['user-agent'],
        });
        return { success: true };
    }

    @Post('subscribe/fcm')
    @ApiOperation({ summary: 'Subscribe to FCM' })
    @ApiOkResponse({ type: SuccessResponseDTO })
    public async subscribeFcm(
        @Req() req: ExpressRequest,
        @CurrentUser('id') userId: string,
        @Body() body: FcmDto,
    ) {
        await this.pushSubscriptionRepo.upsertFcm({
            userId,
            token: body.token,
            deviceId: body.deviceId,
            userAgent: req.headers['user-agent'],
        });
        return { success: true };
    }

    @Delete('unsubscribe')
    @ApiOperation({ summary: 'Unsubscribe from all push notifications' })
    @ApiOkResponse({ type: SuccessResponseDTO })
    public async unsubscribe(@CurrentUser('id') userId: string) {
        await this.pushSubscriptionRepo.deleteAllForUser(userId);
        return { success: true };
    }

    @Get('preferences')
    @ApiOperation({ summary: 'Get notification preferences' })
    @ApiOkResponse({ type: PushPreferencesResponseDTO })
    public async getPreferences(@CurrentUser('id') userId: string) {
        const preferences =
            await this.userRepo.findNotificationPreferences(userId);
        return (
            preferences ?? {
                mention: true,
                friend_request: true,
                custom: true,
            }
        );
    }

    @Patch('preferences')
    @ApiOperation({ summary: 'Update notification preferences' })
    @ApiOkResponse({ type: SuccessResponseDTO })
    public async updatePreferences(
        @CurrentUser('id') userId: string,
        @Body() body: UpdatePreferencesDto,
    ) {
        await this.userRepo.updateNotificationPreferences(userId, body);
        return { success: true };
    }

    @Post('migrate-vapid')
    @ApiOperation({ summary: 'Migrate VAPID subscription' })
    @ApiOkResponse({ type: SuccessResponseDTO })
    public async migrateVapid(
        @Req() req: ExpressRequest,
        @CurrentUser('id') userId: string,
        @Body() body: MigrateVapidDto,
    ) {
        await this.pushSubscriptionRepo.deleteWebPushByEndpoint(
            userId,
            body.oldEndpoint,
        );
        await this.pushSubscriptionRepo.upsertWebPush({
            userId,
            endpointData: body.newSubscription,
            vapidKeyVersion: VAPID_KEY_VERSION,
            userAgent: req.headers['user-agent'],
        });
        return { success: true };
    }
}
