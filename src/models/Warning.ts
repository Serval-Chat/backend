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
    // Minutes after acknowledgment before the warning's record expires.
    // Undefined/null means it never expires once acknowledged.
    expiryDurationMinutes?: number;
    // Computed from expiryDurationMinutes at the moment the user
    // acknowledges; stays unset while the warning is still unacknowledged,
    // since the record only starts expiring once it's been acted on.
    expiresAt?: Date;
}

const schema = new Schema<IWarning>({
    userId: { type: String, required: true },
    issuedBy: { type: String, required: true },
    message: { type: String, required: true },
    acknowledged: { type: Boolean, default: false },
    acknowledgedAt: { type: Date },
    timestamp: { type: Date, default: Date.now },
    expiryDurationMinutes: { type: Number },
    expiresAt: { type: Date },
});

schema.plugin(mongooseIdPlugin);

schema.plugin(snowflakeIdPlugin);

// Warning Model
export const Warning = model<IWarning>('Warning', schema);
