import type { Document, Types } from 'mongoose';
import { Schema, model } from 'mongoose';

// DM Unread Interface
//
// Tracks the number of unread messages for a user from a specific peer
export interface IDmUnread extends Document {
    user: Types.ObjectId;
    peer: Types.ObjectId;
    count: number;
    createdAt: Date;
    updatedAt: Date;
}

const schema = new Schema<IDmUnread>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        peer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        count: { type: Number, required: true, default: 0 },
    },
    {
        timestamps: true,
    },
);

schema.index({ user: 1, peer: 1 }, { unique: true });

// DM Unread Model
export const DmUnread = model<IDmUnread>('DmUnread', schema);
