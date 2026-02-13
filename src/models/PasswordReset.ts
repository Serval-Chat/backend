import type { Document, Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface IPasswordReset extends Document {
    userId: Types.ObjectId;
    hashedToken: string;
    expiresAt: Date;
    usedAt?: Date;
    ipParam?: string;
    createdAt: Date;
}

const schema = new Schema<IPasswordReset>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        hashedToken: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        usedAt: { type: Date },
        ipParam: { type: String },
    },
    {
        timestamps: true,
    },
);

schema.index({ hashedToken: 1 });
schema.index({ userId: 1, expiresAt: 1, usedAt: 1 });
schema.index({ ipParam: 1, createdAt: 1, usedAt: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordReset = model<IPasswordReset>('PasswordReset', schema);
