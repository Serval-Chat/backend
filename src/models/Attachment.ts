import { Schema } from 'mongoose';

export type MessageAttachmentType =
    | 'image'
    | 'video'
    | 'audio'
    | 'text'
    | 'file';

export interface IMessageAttachment {
    attachmentId: string;
    type: MessageAttachmentType;
    mimeType: string;
    name: string;
    size: number;
    width?: number;
    height?: number;
    spoiler?: boolean;
}

export const messageAttachmentSchema = new Schema<IMessageAttachment>(
    {
        attachmentId: { type: String, required: true },
        type: {
            type: String,
            enum: ['image', 'video', 'audio', 'text', 'file'],
            required: true,
        },
        mimeType: { type: String, required: true },
        name: { type: String, required: true },
        size: { type: Number, required: true },
        width: { type: Number, required: false },
        height: { type: Number, required: false },
        spoiler: { type: Boolean, required: false },
    },
    { _id: false },
);
