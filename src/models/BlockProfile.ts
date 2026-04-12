import type { Document, Model, Types } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

export interface IBlockProfile extends Document {
    _id: Types.ObjectId;
    ownerId: Types.ObjectId;
    name: string;
    flags: number;
    createdAt: Date;
    updatedAt: Date;
}

const blockProfileSchema = new Schema<IBlockProfile>(
    {
        ownerId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        flags: {
            type: Number,
            default: 0,
            min: 0,
            max: 32767,
        },
    },
    { timestamps: true },
);

// user can't have duplicate profile names
blockProfileSchema.index({ ownerId: 1, name: 1 }, { unique: true });

export const BlockProfile: Model<IBlockProfile> = mongoose.model(
    'BlockProfile',
    blockProfileSchema,
);
