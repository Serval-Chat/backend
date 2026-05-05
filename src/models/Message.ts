import type { Document, Model, Types } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

// Direct Message interface
//
// Represents a private message between two users
export interface IMessage extends Document {
    senderId: Types.ObjectId;
    receiverId: Types.ObjectId;
    text: string;
    createdAt: Date;
    replyToId?: Types.ObjectId;
    repliedToMessageId?: Types.ObjectId;
    stickerId?: Types.ObjectId;
    editedAt?: Date;
    isEdited?: boolean;
    senderDeleted?: boolean;
    anonymizedSender?: string;
    receiverDeleted?: boolean;
    anonymizedReceiver?: string;
}

// Hard deletion fields preserved for backward compatibility

const messageSchema = new Schema<IMessage>({
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: false, default: '' },
    createdAt: { type: Date, default: Date.now },
    replyToId: { type: String, required: false },
    repliedToMessageId: {
        type: Schema.Types.ObjectId,
        ref: 'Message',
        required: false,
    },
    stickerId: { type: Schema.Types.ObjectId, ref: 'Sticker', required: false },
    editedAt: { type: Date, required: false },
    isEdited: { type: Boolean, default: false },
    senderDeleted: { type: Boolean, default: false },
    anonymizedSender: { type: String },
    receiverDeleted: { type: Boolean, default: false },
    anonymizedReceiver: { type: String },
});

// Indexing for performance
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, senderId: 1, createdAt: -1 });
messageSchema.index({ createdAt: -1 });

// Direct Message model
export const Message: Model<IMessage> = mongoose.model(
    'Message',
    messageSchema,
);
