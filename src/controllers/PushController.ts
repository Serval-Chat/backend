import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Req,
    UseGuards,
    SetMetadata,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { injectable } from 'inversify';
import type { Request as ExpressRequest } from 'express';
import { JWTPayload } from '@/utils/jwt';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { PushSubscription } from '@/models/PushSubscription';
import { User } from '@/models/User';
import {
    WebPushDto,
    FcmDto,
    UpdatePreferencesDto,
    MigrateVapidDto,
} from './dto/push.request.dto';
import { Types } from 'mongoose';
import { VAPID_PUB } from '@/config/env';

@injectable()
@Controller('api/v1/push')
@ApiTags('Push')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PushController {
    public constructor() {}

    @Get('vapid-public-key')
    @SetMetadata('isPublic', true)
    @ApiOperation({ summary: 'Get VAPID public key' })
    public getVapidKey() {
        return { publicKey: VAPID_PUB };
    }

    @Get('vapid-status')
    @SetMetadata('isPublic', true)
    @ApiOperation({ summary: 'Get VAPID status' })
    public vapidStatus() {
        return {
            currentVersion: process.env.VAPID_KEY_VERSION ?? 'v1',
            currentPublicKey: VAPID_PUB,
        };
    }

    @Post('subscribe/web')
    @ApiOperation({ summary: 'Subscribe to web push' })
    public async subscribeWeb(
        @Req() req: ExpressRequest,
        @Body() body: WebPushDto,
    ) {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        await PushSubscription.updateOne(
            { userId, 'endpointData.endpoint': body.subscription.endpoint },
            {
                $set: {
                    userId,
                    type: 'webpush',
                    endpointData: body.subscription,
                    vapidKeyVersion: process.env.VAPID_KEY_VERSION ?? 'v1',
                    userAgent: req.headers['user-agent'],
                },
            },
            { upsert: true },
        );
        return { success: true };
    }

    @Post('subscribe/fcm')
    @ApiOperation({ summary: 'Subscribe to FCM' })
    public async subscribeFcm(
        @Req() req: ExpressRequest,
        @Body() body: FcmDto,
    ) {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        await PushSubscription.updateOne(
            { userId, fcmToken: body.token },
            {
                $set: {
                    userId,
                    type: 'fcm',
                    fcmToken: body.token,
                    userAgent: req.headers['user-agent'],
                },
            },
            { upsert: true },
        );
        return { success: true };
    }

    @Delete('unsubscribe')
    @ApiOperation({ summary: 'Unsubscribe from all push notifications' })
    public async unsubscribe(@Req() req: ExpressRequest) {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        await PushSubscription.deleteMany({ userId });
        return { success: true };
    }

    @Get('preferences')
    @ApiOperation({ summary: 'Get notification preferences' })
    public async getPreferences(@Req() req: ExpressRequest) {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const user = await User.findById(new Types.ObjectId(userId))
            .select('notificationPreferences')
            .lean();
        return (
            user?.notificationPreferences ?? {
                mention: true,
                friend_request: true,
                custom: true,
            }
        );
    }

    @Patch('preferences')
    @ApiOperation({ summary: 'Update notification preferences' })
    public async updatePreferences(
        @Req() req: ExpressRequest,
        @Body() body: UpdatePreferencesDto,
    ) {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;

        const updateObj: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(body)) {
            updateObj[`notificationPreferences.${k}`] = v;
        }

        await User.findByIdAndUpdate(new Types.ObjectId(userId), {
            $set: updateObj,
        });
        return { success: true };
    }

    @Post('migrate-vapid')
    @ApiOperation({ summary: 'Migrate VAPID subscription' })
    public async migrateVapid(
        @Req() req: ExpressRequest,
        @Body() body: MigrateVapidDto,
    ) {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        await PushSubscription.deleteOne({
            userId,
            'endpointData.endpoint': body.oldEndpoint,
        });

        await PushSubscription.updateOne(
            { userId, 'endpointData.endpoint': body.newSubscription.endpoint },
            {
                $set: {
                    userId,
                    type: 'webpush',
                    endpointData: body.newSubscription,
                    vapidKeyVersion: process.env.VAPID_KEY_VERSION ?? 'v1',
                    userAgent: req.headers['user-agent'],
                },
            },
            { upsert: true },
        );
        return { success: true };
    }
}
