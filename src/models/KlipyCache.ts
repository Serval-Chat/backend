import type { Document } from 'mongoose';
import { Schema } from 'mongoose';

export interface IKlipyCache extends Document {
    klipyId: string;
    url: string;
    previewUrl: string;
    width: number;
    height: number;
    expiresAt: Date;
}

const schema = new Schema<IKlipyCache>(
    {
        klipyId: { type: String, required: true, unique: true },
        url: { type: String, required: true },
        previewUrl: { type: String, required: true },
        width: { type: Number, required: true },
        height: { type: Number, required: true },
        expiresAt: { type: Date, required: true, index: { expires: 0 } },
    },
    { timestamps: true },
);

export const KlipyCache = {
    schema,
};
