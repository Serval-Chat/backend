import type { IPushSubscription } from '@/models/PushSubscription';

export type WebPushEndpointData = NonNullable<
    IPushSubscription['endpointData']
>;

export interface IPushSubscriptionRepository {
    upsertWebPush(data: {
        userId: string;
        endpointData: WebPushEndpointData;
        vapidKeyVersion: string;
        userAgent?: string;
    }): Promise<void>;
    upsertFcm(data: {
        userId: string;
        token: string;
        deviceId?: string;
        userAgent?: string;
    }): Promise<void>;
    deleteWebPushByEndpoint(userId: string, endpoint: string): Promise<void>;
    deleteAllForUser(userId: string): Promise<void>;
}
