import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { Model, Document } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

// Webhook interface
//
// Represents an incoming webhook integration for a channel
// Allows external services to post messages using a secret token
export interface IWebhook extends Document {
    snowflakeId: string;
    _id: mongoose.Types.ObjectId;
    serverId: string;
    channelId: string;
    name: string;
    token: string;
    avatarUrl?: string;
    createdBy: string;
    createdAt: Date;
}

const webhookSchema = new Schema<IWebhook>({
    serverId: { type: String, required: true },
    channelId: { type: String, required: true },
    name: { type: String, required: true, maxlength: 100 },
    token: { type: String, required: true, unique: true, length: 128 },
    avatarUrl: { type: String, required: false },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});

webhookSchema.plugin(mongooseIdPlugin);

webhookSchema.plugin(snowflakeIdPlugin);
webhookSchema.index({ serverId: 1, channelId: 1 });

// Webhook model
export const Webhook: Model<IWebhook> = mongoose.model(
    'Webhook',
    webhookSchema,
);
