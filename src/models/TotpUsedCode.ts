import { Schema, model, type Document, type Types } from 'mongoose';

export interface ITotpUsedCode extends Document {
    userId: Types.ObjectId;
    code: string;
    expiresAt: Date;
    createdAt: Date;
}

const schema = new Schema<ITotpUsedCode>({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
});

schema.index({ userId: 1, code: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const TotpUsedCode = model<ITotpUsedCode>('TotpUsedCode', schema);
