import type { Types, Document } from 'mongoose';
import { Schema, model } from 'mongoose';

/**
 * Warning Interface.
 *
 * Represents a formal warning issued to a user by a moderator.
 * Requires acknowledgment by the user.
 */
export interface IWarning extends Document {
    userId: Types.ObjectId;
    issuedBy: Types.ObjectId;
    message: string;
    acknowledged: boolean;
    acknowledgedAt?: Date;
    timestamp: Date;
}

const schema = new Schema<IWarning>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    acknowledged: { type: Boolean, default: false },
    acknowledgedAt: { type: Date },
    timestamp: { type: Date, default: Date.now },
});

/**
 * Warning Model.
 */
export const Warning = model<IWarning>('Warning', schema);
