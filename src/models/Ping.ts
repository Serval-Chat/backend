import type { Document, Model, Types } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

/**
 * Ping Interface.
 *
 * Represents a notification/mention for a user.
 */
interface IPing extends Document {
    userId: Types.ObjectId; // User ID who received the ping
    type: 'mention';
    sender: string; // Username of the sender. Todo: Remove this dependency in favor of senderId
    senderId: Types.ObjectId; // User ID of the sender
    serverId?: Types.ObjectId; // Server ID if ping is from a server message
    channelId?: Types.ObjectId; // Channel ID if ping is from a server message
    messageId: Types.ObjectId; // Reference to the message that triggered the ping
    message: any; // Full message object (stored for quick access)
    timestamp: Date;
    createdAt: Date;
}

const pingSchema = new Schema<IPing>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ['mention'],
            required: true,
            default: 'mention',
        },
        sender: { type: String, required: true },
        senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        serverId: {
            type: Schema.Types.ObjectId,
            ref: 'Server',
            required: false,
        },
        channelId: {
            type: Schema.Types.ObjectId,
            ref: 'Channel',
            required: false,
        },
        messageId: { type: Schema.Types.ObjectId, required: true },
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

// Compound index for efficient queries
pingSchema.index({ userId: 1, timestamp: -1 });
// Index for deduplication checks (one ping per user per message from a sender)
pingSchema.index({ userId: 1, senderId: 1, messageId: 1 }, { unique: true });

/**
 * Ping Model.
 */
export const Ping: Model<IPing> = mongoose.model('Ping', pingSchema);
