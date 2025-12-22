import type { Document, Types } from 'mongoose';
import { Schema, model } from 'mongoose';

/**
 * Emoji Interface.
 *
 * Represents a custom emoji uploaded to a server.
 */
export interface IEmoji extends Document {
    _id: Types.ObjectId;
    name: string;
    imageUrl: string;
    serverId: Types.ObjectId;
    createdBy: Types.ObjectId;
    createdAt: Date;
}

const schema = new Schema<IEmoji>(
    {
        name: {
            type: String,
            required: true,
            maxlength: 32,
            match: /^[a-zA-Z0-9_-]+$/, // Only alphanumeric, underscore, dash. Move me to a different file??
        },
        imageUrl: {
            type: String,
            required: true,
        },
        serverId: {
            type: Schema.Types.ObjectId,
            ref: 'Server',
            required: true,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    },
);

// Compound index for unique emoji names per server
schema.index({ serverId: 1, name: 1 }, { unique: true });

/**
 * Emoji Model.
 */
export const Emoji = model<IEmoji>('Emoji', schema);
