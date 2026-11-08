import { injectable } from 'inversify';
import { PushSubscription } from '@/models/PushSubscription';
import type {
    IPushSubscriptionRepository,
    WebPushEndpointData,
} from '@/di/interfaces/IPushSubscriptionRepository';

@injectable()
export class MongoosePushSubscriptionRepository implements IPushSubscriptionRepository {
    public async upsertWebPush(data: {
        userId: string;
        endpointData: WebPushEndpointData;
        vapidKeyVersion: string;
        userAgent?: string;
    }): Promise<void> {
        await PushSubscription.updateOne(
            {
                userId: data.userId,
                'endpointData.endpoint': data.endpointData.endpoint,
            },
            {
                $set: {
                    userId: data.userId,
                    type: 'webpush',
                    endpointData: data.endpointData,
                    vapidKeyVersion: data.vapidKeyVersion,
                    userAgent: data.userAgent,
                },
            },
            { upsert: true },
        );
    }

    public async upsertFcm(data: {
        userId: string;
        token: string;
        deviceId?: string;
        userAgent?: string;
    }): Promise<void> {
        const hasDevice =
            data.deviceId !== undefined && data.deviceId.trim() !== '';

        if (hasDevice) {
            await PushSubscription.deleteMany({
                userId: data.userId,
                type: 'fcm',
                deviceId: data.deviceId,
                fcmToken: { $ne: data.token },
            });
        }

        await PushSubscription.updateOne(
            { userId: data.userId, fcmToken: data.token },
            {
                $set: {
                    userId: data.userId,
                    type: 'fcm',
                    fcmToken: data.token,
                    ...(hasDevice ? { deviceId: data.deviceId } : {}),
                    userAgent: data.userAgent,
                },
            },
            { upsert: true },
        );
    }

    public async deleteWebPushByEndpoint(
        userId: string,
        endpoint: string,
    ): Promise<void> {
        await PushSubscription.deleteOne({
            userId,
            'endpointData.endpoint': endpoint,
        });
    }

    public async deleteAllForUser(userId: string): Promise<void> {
        await PushSubscription.deleteMany({ userId });
    }
}
