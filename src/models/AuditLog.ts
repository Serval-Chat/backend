import type { Types, Document } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface IAuditLogChange {
    field: string;
    before: unknown;
    after: unknown;
}

// Audit Log interface
//
// Represents a record of an administrative action for accountability
export interface IAuditLog extends Document {
    serverId?: Types.ObjectId;
    actorId: Types.ObjectId;
    actionType: string;
    targetId?: Types.ObjectId;
    targetType?: 'user' | 'channel' | 'category' | 'role' | 'message' | 'server';
    targetUserId?: Types.ObjectId;
    changes?: IAuditLogChange[];
    reason?: string;
    metadata?: Record<string, unknown>;
    additionalData?: Record<string, unknown>;
    timestamp: Date;
}

const changeSchema = new Schema<IAuditLogChange>(
    {
        field: { type: String, required: true },
        before: { type: Schema.Types.Mixed },
        after: { type: Schema.Types.Mixed },
    },
    { _id: false },
);

const schema = new Schema<IAuditLog>({
    serverId: { type: Schema.Types.ObjectId, ref: 'Server', index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actionType: { type: String, required: true },
    targetId: { type: Schema.Types.ObjectId },
    targetType: {
        type: String,
        enum: ['user', 'channel', 'category', 'role', 'message', 'server'],
    },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    changes: { type: [changeSchema] },
    reason: { type: String },
    metadata: { type: Schema.Types.Mixed },
    additionalData: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now, index: true },
});

// Composite index for efficient per-server queries sorted by time
schema.index({ serverId: 1, timestamp: -1 });
schema.index({ serverId: 1, _id: -1 });

// Audit Log model
//
// Tracks administrative actions (e.g., bans, role changes, server deletions)
export const AuditLog = model<IAuditLog>('AuditLog', schema);
