import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { Document } from 'mongoose';
import { Schema, model } from 'mongoose';

// DM Unread Interface
//
// Tracks the number of unread messages for a user from a specific peer
export interface IDmUnread extends Document {
    snowflakeId: string;
    user: string;
    peer: string;
    count: number;
    createdAt: Date;
    updatedAt: Date;
}

const schema = new Schema<IDmUnread>(
    {
        user: {
            type: String,
            required: true,
            index: true,
        },
        peer: { type: String, required: true },
        count: { type: Number, required: true, default: 0 },
    },
    {
        timestamps: true,
    },
);

schema.plugin(mongooseIdPlugin);

schema.plugin(snowflakeIdPlugin);
schema.index({ user: 1, peer: 1 }, { unique: true });

// DM Unread Model
export const DmUnread = model<IDmUnread>('DmUnread', schema);
