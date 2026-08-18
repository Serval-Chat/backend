import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { Document } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface IUserSession extends Document {
    snowflakeId: string;
    userId: string;
    tokenHash: string;
    userAgent: string;
    ip: string;
    durationDays: number;
    lastSeenAt: Date;
    expiresAt: Date;
    createdAt: Date;
}

const schema = new Schema<IUserSession>(
    {
        userId: { type: String, required: true },
        tokenHash: { type: String, required: true, unique: true },
        userAgent: { type: String, required: true, maxlength: 512 },
        ip: { type: String, required: true },
        durationDays: { type: Number, required: true },
        lastSeenAt: { type: Date, required: true },
        expiresAt: { type: Date, required: true },
    },
    {
        timestamps: true,
    },
);

schema.plugin(mongooseIdPlugin);

schema.plugin(snowflakeIdPlugin);
schema.index({ userId: 1, expiresAt: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UserSession = model<IUserSession>('UserSession', schema);
