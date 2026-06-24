import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { Document, Model, Types } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

export interface IUserBlock extends Document {
    snowflakeId: string;
    _id: Types.ObjectId;
    blockerId: string;
    targetId: string;
    profileId: string;
    createdAt: Date;
    updatedAt: Date;
}

const userBlockSchema = new Schema<IUserBlock>(
    {
        blockerId: {
            type: String,
            required: true,
            index: true,
        },
        targetId: {
            type: String,
            required: true,
            index: true,
        },
        profileId: {
            type: String,
            required: true,
        },
    },
    { timestamps: true },
);

userBlockSchema.plugin(mongooseIdPlugin);

userBlockSchema.plugin(snowflakeIdPlugin);

userBlockSchema.virtual('targetIdUser', {
    ref: 'User',
    localField: 'targetId',
    foreignField: 'snowflakeId',
    justOne: true,
});

userBlockSchema.virtual('profileIdProfile', {
    ref: 'BlockProfile',
    localField: 'profileId',
    foreignField: 'snowflakeId',
    justOne: true,
});

userBlockSchema.index({ blockerId: 1, targetId: 1 }, { unique: true });
userBlockSchema.index({ profileId: 1 });

export const UserBlock: Model<IUserBlock> = mongoose.model(
    'UserBlock',
    userBlockSchema,
);
