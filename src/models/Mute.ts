import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { Document, Model } from 'mongoose';
import { Schema, model } from 'mongoose';

// Mute History Entry interface
//
// Tracks a single mute event for a user's history
export interface IMuteHistoryEntry {
    reason: string;
    issuedBy: string;
    timestamp: Date;
    expirationTimestamp?: Date;
    endedAt?: Date;
}

// Mute interface
//
// Represents an active or past mute for a user
export interface IMute extends Document {
    snowflakeId: string;
    userId: string;
    issuedBy: string;
    reason: string;
    timestamp: Date;
    expirationTimestamp?: Date;
    active: boolean;
    history: IMuteHistoryEntry[];
}

export interface IMuteModel extends Model<IMute> {
    checkExpired(userId: string): Promise<boolean>;
}

const schema = new Schema<IMute>({
    userId: { type: String, required: true },
    issuedBy: { type: String, required: true },
    reason: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    expirationTimestamp: { type: Date },
    active: { type: Boolean, default: true },
    history: {
        type: [
            new Schema(
                {
                    reason: { type: String, required: true },
                    issuedBy: {
                        type: String,
                        required: true,
                    },
                    timestamp: { type: Date, required: true },
                    expirationTimestamp: { type: Date },
                    endedAt: { type: Date },
                },
                { _id: false },
            ),
        ],
        default: [],
    },
});

schema.plugin(mongooseIdPlugin);

schema.plugin(snowflakeIdPlugin);

// Check and deactivate expired mutes for a user
//
// @returns true if any mute state was changed (expired), false otherwise
schema.statics.checkExpired = async function (userId: string) {
    const now = new Date();

    const expiredMutes = await this.find({
        userId,
        active: true,
        expirationTimestamp: { $lt: now, $ne: null },
    });

    if (expiredMutes.length > 0) {
        await this.updateMany(
            { _id: { $in: expiredMutes.map((m: IMute) => m._id) } },
            { $set: { active: false } },
        );
        return true;
    }
    return false;
};

export const Mute = model<IMute, IMuteModel>('Mute', schema);
