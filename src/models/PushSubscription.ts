import mongoose, { Schema, type Document } from 'mongoose';
import { type PushSubscription as WebPushSubscription } from 'web-push';

export interface IPushSubscription extends Document {
    userId: string;
    type: 'webpush' | 'fcm';
    endpointData?: WebPushSubscription;
    fcmToken?: string;
    vapidKeyVersion?: string;
    userAgent?: string;
    createdAt: Date;
}

const PushSubscriptionSchema = new Schema<IPushSubscription>({
    userId: { type: String, required: true, index: true },
    type: { type: String, enum: ['webpush', 'fcm'], required: true },
    endpointData: { type: Schema.Types.Mixed },
    fcmToken: { type: String },
    vapidKeyVersion: { type: String, default: 'v1' },
    userAgent: { type: String },
    createdAt: { type: Date, default: Date.now },
});

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

export const PushSubscription = mongoose.model<IPushSubscription>(
    'PushSubscription',
    PushSubscriptionSchema,
);
