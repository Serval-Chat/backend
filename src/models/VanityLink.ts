import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { Model, Document } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

// VanityLink interface
export interface IVanityLink extends Document {
    snowflakeId: string;
    _id: mongoose.Types.ObjectId;
    serverId: string;
    code: string;
    createdByUserId: string;
    createdAt: Date;
}

const vanityLinkSchema = new Schema<IVanityLink>({
    serverId: { type: String, required: true, unique: true },
    code: {
        type: String,
        required: true,
        unique: true,
        minlength: 2,
        maxlength: 18,
        match: /^[A-Za-z0-9]+$/,
    },
    createdByUserId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});

vanityLinkSchema.plugin(mongooseIdPlugin);
vanityLinkSchema.plugin(snowflakeIdPlugin);

// VanityLink model
export const VanityLink: Model<IVanityLink> = mongoose.model(
    'VanityLink',
    vanityLinkSchema,
);
