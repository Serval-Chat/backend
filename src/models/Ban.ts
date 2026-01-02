import type { Types, Document, Model } from 'mongoose';
import { Schema, model } from 'mongoose';

// Ban History Entry interface
//
// Tracks a single ban event for a user's history
export interface IBanHistoryEntry {
    reason: string;
    issuedBy: Types.ObjectId;
    timestamp: Date;
    expirationTimestamp: Date;
    endedAt?: Date;
}

// Ban interface
//
// Represents an active or past ban for a user
export interface IBan extends Document {
    userId: Types.ObjectId;
    issuedBy: Types.ObjectId;
    reason: string;
    timestamp: Date;
    expirationTimestamp: Date;
    active: boolean;
    history: IBanHistoryEntry[];
}

export interface IBanModel extends Model<IBan> {
    checkExpired(userId: Types.ObjectId | string): Promise<boolean>;
}

const schema = new Schema<IBan>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    expirationTimestamp: { type: Date, required: true },
    active: { type: Boolean, default: true },
    history: {
        type: [
            new Schema(
                {
                    reason: { type: String, required: true },
                    issuedBy: {
                        type: Schema.Types.ObjectId,
                        ref: 'User',
                        required: true,
                    },
                    timestamp: { type: Date, required: true },
                    expirationTimestamp: { type: Date, required: true },
                    endedAt: { type: Date },
                },
                { _id: false },
            ),
        ],
        default: [],
    },
});

// Check and deactivate expired bans for a user
//
// @returns true if any ban state was changed (expired), false otherwise
schema.statics.checkExpired = async function (userId: Types.ObjectId | string) {
    const now = new Date();
    // Find active bans that have expired
    const expiredBans = await this.find({
        userId,
        active: true,
        expirationTimestamp: { $lt: now },
    });

    if (expiredBans.length > 0) {
        await this.updateMany(
            { _id: { $in: expiredBans.map((b: IBan) => b._id) } },
            { $set: { active: false } },
        );
        return true; // State changed
    }
    return false; // No state change
};

export const Ban = model<IBan, IBanModel>('Ban', schema);
