import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { Document, Types } from 'mongoose';
import { Schema, model } from 'mongoose';

// Emoji interface
//
// Represents a custom emoji uploaded to a server
export interface IEmoji extends Document {
    snowflakeId: string;
    _id: Types.ObjectId;
    name: string;
    imageUrl: string;
    serverId: string;
    createdBy: string;
    createdAt: Date;
}

const schema = new Schema<IEmoji>(
    {
        name: {
            type: String,
            required: true,
            maxlength: 32,
            match: /^[a-zA-Z0-9_-]+$/, // Only alphanumeric, underscore, dash
        },
        imageUrl: {
            type: String,
            required: true,
        },
        serverId: {
            type: String,
            required: true,
        },
        createdBy: {
            type: String,
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

schema.plugin(mongooseIdPlugin);

schema.plugin(snowflakeIdPlugin);

// Compound index for unique emoji names per server
schema.index({ serverId: 1, name: 1 }, { unique: true });

// Emoji model
export const Emoji = model<IEmoji>('Emoji', schema);
