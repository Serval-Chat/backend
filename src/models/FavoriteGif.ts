import type { Document, Types } from 'mongoose';
import { Schema } from 'mongoose';

export interface IFavoriteGif extends Document {
    userId: Types.ObjectId;
    klipyId: string;
    url: string;
    previewUrl: string;
    width: number;
    height: number;
    contentType: 'gif' | 'sticker';
}

const schema = new Schema<IFavoriteGif>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        klipyId: { type: String, required: true },
        url: { type: String, required: true },
        previewUrl: { type: String, required: true },
        width: { type: Number, required: true },
        height: { type: Number, required: true },
        contentType: { type: String, enum: ['gif', 'sticker'], default: 'gif' },
    },
    { timestamps: true },
);

schema.index({ userId: 1, klipyId: 1 }, { unique: true });

export const FavoriteGif = {
    schema,
};
