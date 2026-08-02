import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { Document } from 'mongoose';
import { Schema } from 'mongoose';

export interface IGifTag extends Document {
    snowflakeId: string;
    ownerId: string;
    name: string;
    nameLower: string;
    createdAt: Date;
    updatedAt: Date;
}

const schema = new Schema<IGifTag>(
    {
        ownerId: {
            type: String,
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        nameLower: {
            type: String,
            required: true,
        },
    },
    { timestamps: true },
);

schema.plugin(mongooseIdPlugin);

schema.plugin(snowflakeIdPlugin);

schema.index({ ownerId: 1, nameLower: 1 }, { unique: true });

export const GifTag = {
    schema,
};
