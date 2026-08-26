import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { Document } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface IChannelRead extends Document {
    snowflakeId: string;
    userId: string;
    channelId: string;
    lastReadAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const schema = new Schema<IChannelRead>(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        channelId: { type: String, required: true },
        lastReadAt: { type: Date, default: Date.now },
    },
    {
        timestamps: true,
    },
);

schema.plugin(mongooseIdPlugin);

schema.plugin(snowflakeIdPlugin);
schema.index({ userId: 1, channelId: 1 }, { unique: true });

export const ChannelRead = model<IChannelRead>('ChannelRead', schema);
