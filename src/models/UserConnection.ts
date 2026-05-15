import type { Document, Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export type UserConnectionType = 'Website';
export type UserConnectionStatus = 'pending' | 'verified';

export interface IUserConnection extends Document {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    type: UserConnectionType;
    value: string;
    normalizedValue: string;
    status: UserConnectionStatus;
    verificationTokenHash?: string;
    verificationRecordName?: string;
    expiresAt?: Date;
    verifiedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const userConnectionSchema = new Schema<IUserConnection>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ['Website'],
            required: true,
        },
        value: { type: String, required: true, trim: true },
        normalizedValue: { type: String, required: true, trim: true },
        status: {
            type: String,
            enum: ['pending', 'verified'],
            required: true,
            default: 'pending',
        },
        verificationTokenHash: { type: String, required: false },
        verificationRecordName: { type: String, required: false },
        expiresAt: { type: Date, required: false },
        verifiedAt: { type: Date, required: false },
    },
    { timestamps: true },
);

userConnectionSchema.index(
    { type: 1, normalizedValue: 1 },
    {
        unique: true,
        partialFilterExpression: { type: 'Website', status: 'verified' },
    },
);

userConnectionSchema.index(
    { userId: 1, type: 1, normalizedValue: 1 },
    { unique: true },
);

export const UserConnection = model<IUserConnection>(
    'UserConnection',
    userConnectionSchema,
);
