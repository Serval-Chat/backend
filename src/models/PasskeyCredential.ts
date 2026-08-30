import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { Document } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface IPasskeyCredential extends Document {
    snowflakeId: string;
    userId: string;
    credentialId: string;
    publicKey: Buffer;
    counter: number;
    transports?: string[];
    deviceType: 'singleDevice' | 'multiDevice';
    backedUp: boolean;
    aaguid?: string;
    name: string;
    lastUsedAt: Date | null;
    createdAt: Date;
}

const schema = new Schema<IPasskeyCredential>(
    {
        userId: { type: String, required: true },
        credentialId: { type: String, required: true, unique: true },
        publicKey: { type: Buffer, required: true },
        counter: { type: Number, required: true },
        transports: { type: [String], required: false },
        deviceType: {
            type: String,
            enum: ['singleDevice', 'multiDevice'],
            required: true,
        },
        backedUp: { type: Boolean, required: true },
        aaguid: { type: String, required: false },
        name: { type: String, required: true },
        lastUsedAt: { type: Date, default: null },
    },
    {
        timestamps: true,
    },
);

schema.plugin(mongooseIdPlugin);
schema.plugin(snowflakeIdPlugin);
schema.index({ userId: 1 });

export const PasskeyCredential = model<IPasskeyCredential>(
    'PasskeyCredential',
    schema,
);
