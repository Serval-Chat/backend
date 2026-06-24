import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { Document } from 'mongoose';
import { Schema, model } from 'mongoose';

interface IAdminNoteUserRef {
    username?: string;
    displayName?: string | null;
    profilePicture?: string;
}

export interface IAdminNoteHistory {
    content: string;
    editorId: string;
    // not a real Mongoose populate path, history is an array of subdocs,
    // so resolved separately via resolveAdminNoteUserRefs.
    editorIdUser?: IAdminNoteUserRef;
    editedAt: Date;
}

export interface IAdminNote extends Document {
    snowflakeId: string;
    // snowflakeId of the User or Server this note targets.
    targetId: string;
    targetType: 'User' | 'Server';
    adminId: string;
    // populated via .populate('adminIdUser').
    adminIdUser?: IAdminNoteUserRef;
    content: string;
    history: IAdminNoteHistory[];
    deletedAt?: Date;
    deletedBy?: string;
    // populated via .populate('deletedByUser').
    deletedByUser?: IAdminNoteUserRef;
    deleteReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

const adminNoteHistorySchema = new Schema<IAdminNoteHistory>(
    {
        content: { type: String, required: true },
        editorId: { type: String, required: true },
        editedAt: { type: Date, required: true },
    },
    { _id: false },
);

const adminNoteSchema = new Schema<IAdminNote>(
    {
        // mixed for historical reasons; always holds a snowflakeId string
        // (see IAdminNote.targetId).
        targetId: { type: Schema.Types.Mixed, required: true, index: true },
        targetType: {
            type: String,
            enum: ['User', 'Server'],
            required: true,
            index: true,
        },
        adminId: {
            type: String,
            required: true,
            index: true,
        },
        content: { type: String, required: true },
        history: { type: [adminNoteHistorySchema], default: [] },
        deletedAt: { type: Date },
        deletedBy: { type: String },
        deleteReason: { type: String },
    },
    { timestamps: true },
);

adminNoteSchema.plugin(mongooseIdPlugin);

adminNoteSchema.plugin(snowflakeIdPlugin);

adminNoteSchema.virtual('adminIdUser', {
    ref: 'User',
    localField: 'adminId',
    foreignField: 'snowflakeId',
    justOne: true,
});
adminNoteSchema.virtual('deletedByUser', {
    ref: 'User',
    localField: 'deletedBy',
    foreignField: 'snowflakeId',
    justOne: true,
});

adminNoteSchema.index({ targetId: 1, targetType: 1, createdAt: -1 });

export const AdminNote = model<IAdminNote>('AdminNote', adminNoteSchema);
