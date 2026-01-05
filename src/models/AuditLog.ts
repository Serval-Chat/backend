import type { Types, Document } from 'mongoose';
import { Schema, model } from 'mongoose';

// Audit Log interface
//
// Represents a record of an administrative action for accountability
export interface IAuditLog extends Document {
    adminId: Types.ObjectId;
    actionType: string;
    targetUserId?: Types.ObjectId;
    additionalData?: Record<string, unknown>;
    timestamp: Date;
}

const schema = new Schema<IAuditLog>({
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actionType: { type: String, required: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    additionalData: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
});

// Audit Log model
//
// Tracks administrative actions (e.g., bans, role changes, server deletions)
export const AuditLog = model<IAuditLog>('AuditLog', schema);
