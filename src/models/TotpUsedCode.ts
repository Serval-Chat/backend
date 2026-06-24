import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import { Schema, model, type Document } from 'mongoose';

export interface ITotpUsedCode extends Document {
    snowflakeId: string;
    userId: string;
    code: string;
    expiresAt: Date;
    createdAt: Date;
}

const schema = new Schema<ITotpUsedCode>({
    userId: {
        type: String,
        required: true,
        index: true,
    },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
});

schema.plugin(mongooseIdPlugin);

schema.plugin(snowflakeIdPlugin);
schema.index({ userId: 1, code: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const TotpUsedCode = model<ITotpUsedCode>('TotpUsedCode', schema);
