import type { Types, Document } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface IAdminNoteHistory {
    content: string;
    editorId: Types.ObjectId;
    editedAt: Date;
}

export interface IAdminNote extends Document {
    targetId: Types.ObjectId;
    targetType: 'User' | 'Server';
    adminId: Types.ObjectId;
    content: string;
    history: IAdminNoteHistory[];
    deletedAt?: Date;
    deletedBy?: Types.ObjectId;
    deleteReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

const adminNoteHistorySchema = new Schema<IAdminNoteHistory>(
    {
        content: { type: String, required: true },
        editorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        editedAt: { type: Date, required: true },
    },
    { _id: false },
);

const adminNoteSchema = new Schema<IAdminNote>(
    {
        targetId: { type: Schema.Types.ObjectId, required: true, index: true },
        targetType: {
            type: String,
            enum: ['User', 'Server'],
            required: true,
            index: true,
        },
        adminId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        content: { type: String, required: true },
        history: { type: [adminNoteHistorySchema], default: [] },
        deletedAt: { type: Date },
        deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        deleteReason: { type: String },
    },
    { timestamps: true },
);

adminNoteSchema.index({ targetId: 1, targetType: 1, createdAt: -1 });

export const AdminNote = model<IAdminNote>('AdminNote', adminNoteSchema);
