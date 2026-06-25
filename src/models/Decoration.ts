import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { Document, Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface IDecoration extends Document {
    snowflakeId: string;
    _id: Types.ObjectId;
    name: string;
    filename: string;
    createdBy: string;
    createdAt: Date;
}

const schema = new Schema<IDecoration>(
    {
        name: {
            type: String,
            required: true,
            minlength: 2,
            maxlength: 64,
        },
        filename: {
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

export const Decoration = model<IDecoration>('Decoration', schema);
