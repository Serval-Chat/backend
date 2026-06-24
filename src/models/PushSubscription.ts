import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import mongoose, { Schema, type Document } from 'mongoose';
import { type PushSubscription as WebPushSubscription } from 'web-push';

export interface IPushSubscription extends Document {
    snowflakeId: string;
    userId: string;
    type: 'webpush' | 'fcm';
    endpointData?: WebPushSubscription;
    fcmToken?: string;
    vapidKeyVersion?: string;
    deviceId?: string;
    userAgent?: string;
    createdAt: Date;
}

const PushSubscriptionSchema = new Schema<IPushSubscription>({
    userId: { type: String, required: true, index: true },
    type: { type: String, enum: ['webpush', 'fcm'], required: true },
    endpointData: { type: Schema.Types.Mixed },
    fcmToken: { type: String },
    vapidKeyVersion: { type: String, default: 'v1' },
    deviceId: { type: String },
    userAgent: { type: String },
    createdAt: { type: Date, default: Date.now },
});

PushSubscriptionSchema.plugin(mongooseIdPlugin);

PushSubscriptionSchema.plugin(snowflakeIdPlugin);
PushSubscriptionSchema.index(
    { userId: 1, 'endpointData.endpoint': 1 },
    {
        unique: true,
        partialFilterExpression: {
            'endpointData.endpoint': { $type: 'string' },
        },
    },
);
PushSubscriptionSchema.index(
    { userId: 1, fcmToken: 1 },
    {
        unique: true,
        partialFilterExpression: { fcmToken: { $type: 'string' } },
    },
);
PushSubscriptionSchema.index(
    { userId: 1, type: 1, deviceId: 1 },
    {
        partialFilterExpression: { deviceId: { $type: 'string' } },
    },
);

export const PushSubscription = mongoose.model<IPushSubscription>(
    'PushSubscription',
    PushSubscriptionSchema,
);
