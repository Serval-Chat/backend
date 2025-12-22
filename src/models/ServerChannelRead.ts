import type { Document, Types } from 'mongoose';
import { Schema, model } from 'mongoose';

/**
 * Server Channel Read Status Interface.
 *
 * Tracks the last time a user read a specific channel.
 * Used to calculate unread message counts and display indicators.
 */
export interface IServerChannelRead extends Document {
    userId: Types.ObjectId;
    serverId: string;
    channelId: string;
    lastReadAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const schema = new Schema<IServerChannelRead>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        serverId: { type: String, required: true },
        channelId: { type: String, required: true },
        lastReadAt: { type: Date, default: Date.now },
    },
    {
        timestamps: true,
    },
);

schema.index({ userId: 1, channelId: 1 }, { unique: true });

/**
 * Server Channel Read Status Model.
 */
export const ServerChannelRead = model<IServerChannelRead>(
    'ServerChannelRead',
    schema,
);
