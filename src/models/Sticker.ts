import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { Document, Types } from 'mongoose';
import { Schema, model } from 'mongoose';
import {
    STICKER_NAME_MIN_LENGTH,
    STICKER_NAME_MAX_LENGTH,
    STICKER_NAME_REGEX,
} from '@/constants/stickers';

export interface ISticker extends Document {
    snowflakeId: string;
    _id: Types.ObjectId;
    name: string;
    imageUrl: string;
    isAnimated: boolean;
    serverId: string;
    createdBy: string;
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
        isAnimated: {
            type: Boolean,
            default: false,
        },
        serverId: {
            type: String,
            required: true,
        },
        createdBy: {
            type: String,
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

schema.plugin(mongooseIdPlugin);

schema.plugin(snowflakeIdPlugin);
schema.index({ serverId: 1, name: 1 }, { unique: true });

export const Sticker = model<ISticker>('Sticker', schema);
