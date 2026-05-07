import type { Model, Document } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

// Webhook interface
//
// Represents an incoming webhook integration for a channel
// Allows external services to post messages using a secret token
export interface IWebhook extends Document {
    _id: mongoose.Types.ObjectId;
    serverId: mongoose.Types.ObjectId;
    channelId: mongoose.Types.ObjectId;
    name: string;
    token: string;
    avatarUrl?: string;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
}

const webhookSchema = new Schema<IWebhook>({
    serverId: { type: Schema.Types.ObjectId, ref: 'Server', required: true },
    channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true },
    name: { type: String, required: true, maxlength: 100 },
    token: { type: String, required: true, unique: true, length: 128 },
    avatarUrl: { type: String, required: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
});

webhookSchema.index({ serverId: 1, channelId: 1 });

// Webhook model
export const Webhook: Model<IWebhook> = mongoose.model(
    'Webhook',
    webhookSchema,
);
