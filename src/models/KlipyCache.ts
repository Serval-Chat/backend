import { mongooseIdPlugin } from '@/utils/mongooseId';
import mongoose, { Schema } from 'mongoose';
import type { Document, Model } from 'mongoose';

export interface IKlipyCache extends Document {
    klipyId: string;
    slug?: string;
    url: string;
    previewUrl: string;
    width: number;
    height: number;
    contentType: 'gif' | 'sticker';
    expiresAt: Date;
}

const schema = new Schema<IKlipyCache>(
    {
        klipyId: { type: String, required: true, unique: true },
        slug: { type: String, required: false },
        url: { type: String, required: true },
        previewUrl: { type: String, required: true },
        width: { type: Number, required: true },
        height: { type: Number, required: true },
        contentType: { type: String, enum: ['gif', 'sticker'], default: 'gif' },
        expiresAt: { type: Date, required: true, index: { expires: 0 } },
    },
    { timestamps: true },
);

schema.plugin(mongooseIdPlugin);

export const KlipyCache: Model<IKlipyCache> = mongoose.model(
    'KlipyCache',
    schema,
);
