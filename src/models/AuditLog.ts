import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { Document } from 'mongoose';
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
    snowflakeId: string;
    serverId?: string;
    actorId: string;
    actionType: string;
    // snowflakeId of the entity named by targetType. typed as Mixed (not String)
    // for historical reasons; always a string now since all targetType values
    // refer to snowflake-migrated entities.
    targetId?: string;
    targetType?:
        | 'user'
        | 'channel'
        | 'category'
        | 'role'
        | 'message'
        | 'server';
    targetUserId?: string;
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
    serverId: { type: String, index: true },
    actorId: { type: String, required: true },
    actionType: { type: String, required: true },
    // mixed for historical reasons; always holds a snowflakeId string
    // (see IAuditLog.targetId).
    targetId: { type: Schema.Types.Mixed },
    targetType: {
        type: String,
        enum: ['user', 'channel', 'category', 'role', 'message', 'server'],
    },
    targetUserId: { type: String },
    changes: { type: [changeSchema] },
    reason: { type: String },
    metadata: { type: Schema.Types.Mixed },
    additionalData: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now, index: true },
});

schema.plugin(mongooseIdPlugin);

schema.plugin(snowflakeIdPlugin);

schema.virtual('actorIdUser', {
    ref: 'User',
    localField: 'actorId',
    foreignField: 'snowflakeId',
    justOne: true,
});
schema.virtual('targetUserIdUser', {
    ref: 'User',
    localField: 'targetUserId',
    foreignField: 'snowflakeId',
    justOne: true,
});

// Composite index for efficient per-server queries sorted by time
schema.index({ serverId: 1, timestamp: -1 });
schema.index({ serverId: 1, _id: -1 });

// Audit Log model
//
// Tracks administrative actions (e.g., bans, role changes, server deletions)
export const AuditLog = model<IAuditLog>('AuditLog', schema);
