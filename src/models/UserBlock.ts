import type { Document, Model, Types } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

export interface IUserBlock extends Document {
    _id: Types.ObjectId;
    blockerId: Types.ObjectId;
    targetId: Types.ObjectId;
    profileId: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const userBlockSchema = new Schema<IUserBlock>(
    {
        blockerId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        targetId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        profileId: {
            type: Schema.Types.ObjectId,
            ref: 'BlockProfile',
            required: true,
        },
    },
    { timestamps: true },
);

userBlockSchema.index({ blockerId: 1, targetId: 1 }, { unique: true });
userBlockSchema.index({ profileId: 1 });

export const UserBlock: Model<IUserBlock> = mongoose.model(
    'UserBlock',
    userBlockSchema,
);
