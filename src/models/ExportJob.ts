import type { Document, Model, Types } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

export type ExportStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface IExportJob extends Document {
    _id: Types.ObjectId;
    channelId: Types.ObjectId;
    serverId: Types.ObjectId;
    requestedBy: Types.ObjectId;
    status: ExportStatus;
    attempts: number;
    maxAttempts: number;
    error?: string;
    nextAttemptAt?: Date;
    completedAt?: Date;
    expiresAt?: Date;
    downloadToken?: string;
    filePath?: string;
    createdAt: Date;
    updatedAt: Date;
}

const exportJobSchema = new Schema<IExportJob>(
    {
        channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true, index: true },
        serverId: { type: Schema.Types.ObjectId, ref: 'Server', required: true, index: true },
        requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        status: {
            type: String,
            enum: ['queued', 'in_progress', 'completed', 'failed', 'cancelled'],
            default: 'queued',
            required: true,
        },
        attempts: { type: Number, default: 0, required: true },
        maxAttempts: { type: Number, default: 5, required: true },
        error: { type: String },
        nextAttemptAt: { type: Date, default: Date.now, index: true },
        completedAt: { type: Date },
        expiresAt: { type: Date, index: true },
        downloadToken: { type: String, unique: true, sparse: true },
        filePath: { type: String },
    },
    {
        timestamps: true,
    },
);

exportJobSchema.index({ status: 1, nextAttemptAt: 1 });

export const ExportJob: Model<IExportJob> = mongoose.model('ExportJob', exportJobSchema);
