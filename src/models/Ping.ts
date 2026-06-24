import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { Document, Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

// Ping interface
//
// Represents a notification/mention for a user
interface IPing extends Document {
    snowflakeId: string;
    userId: string; // user ID who received the ping
    type: 'mention' | 'export_status';
    sender: string; // Username of the sender. TODO: Remove this dependency in favor of senderId
    senderId: string; // user ID of the sender
    serverId?: string; // server ID if ping is from a server message
    channelId?: string; // channel ID if ping is from a server message
    messageId: string; // reference to the message that triggered the ping
    message: Record<string, unknown>; // Full message object (stored for quick access)
    timestamp: Date;
    createdAt: Date;
}

const pingSchema = new Schema<IPing>(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ['mention', 'export_status'],
            required: true,
            default: 'mention',
        },
        sender: { type: String, required: true },
        senderId: { type: String, required: true },
        serverId: {
            type: String,
            required: false,
        },
        channelId: {
            type: String,
            required: false,
        },
        messageId: { type: String, required: true },
        message: { type: Schema.Types.Mixed, required: true }, // Store full message object
        timestamp: {
            type: Date,
            default: Date.now,
            required: true,
            index: true,
        },
        createdAt: { type: Date, default: Date.now },
    },
    {
        // Compound index for efficient queries
        // Index on userId and timestamp for fetching user's pings
    },
);

pingSchema.plugin(mongooseIdPlugin);

pingSchema.plugin(snowflakeIdPlugin);

// Compound index for efficient queries
pingSchema.index({ userId: 1, timestamp: -1 });
// Index for deduplication checks (one ping per user per message from a sender)
pingSchema.index({ userId: 1, senderId: 1, messageId: 1 }, { unique: true });

// Ping model
export const Ping: Model<IPing> = mongoose.model('Ping', pingSchema);
