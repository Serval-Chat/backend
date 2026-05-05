import type { Document, Types } from 'mongoose';
import { Schema, model } from 'mongoose';
import { 
    STICKER_NAME_MIN_LENGTH, 
    STICKER_NAME_MAX_LENGTH, 
    STICKER_NAME_REGEX 
} from '@/constants/stickers';


export interface ISticker extends Document {
    _id: Types.ObjectId;
    name: string;
    imageUrl: string;
    serverId: Types.ObjectId;
    createdBy: Types.ObjectId;
    createdAt: Date;
}

const schema = new Schema<ISticker>(
    {
        name: {
            type: String,
            required: true,
            minlength: STICKER_NAME_MIN_LENGTH,
            maxlength: STICKER_NAME_MAX_LENGTH,
            match: STICKER_NAME_REGEX,
        },
        imageUrl: {
            type: String,
            required: true,
        },
        serverId: {
            type: Schema.Types.ObjectId,
            ref: 'Server',
            required: true,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    },
);

schema.index({ serverId: 1, name: 1 }, { unique: true });

export const Sticker = model<ISticker>('Sticker', schema);
