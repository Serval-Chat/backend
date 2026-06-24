import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { Document } from 'mongoose';
import { Schema, model } from 'mongoose';

// Warning Interface
//
// Represents a formal warning issued to a user by a moderator
// Requires acknowledgment by the user
export interface IWarning extends Document {
    snowflakeId: string;
    userId: string;
    issuedBy: string;
    message: string;
    acknowledged: boolean;
    acknowledgedAt?: Date;
    timestamp: Date;
}

const schema = new Schema<IWarning>({
    userId: { type: String, required: true },
    issuedBy: { type: String, required: true },
    message: { type: String, required: true },
    acknowledged: { type: Boolean, default: false },
    acknowledgedAt: { type: Date },
    timestamp: { type: Date, default: Date.now },
});

schema.plugin(mongooseIdPlugin);

schema.plugin(snowflakeIdPlugin);

// Warning Model
export const Warning = model<IWarning>('Warning', schema);
