import type { Document, Model, Types } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

/**
 * Direct Message Interface.
 *
 * Represents a private message between two users.
 */
interface IMessage extends Document {
    senderId: Types.ObjectId; // User ID reference for sender
    receiverId: Types.ObjectId; // User ID reference for receiver
    text: string;
    createdAt: Date;
    replyToId?: string;
    repliedToMessageId?: Types.ObjectId;
    editedAt?: Date;
    isEdited?: boolean;
    senderDeleted?: boolean; // Track if sender was hard deleted
    anonymizedSender?: string; // "Deleted User" for hard deleted senders
    receiverDeleted?: boolean; // Track if receiver was hard deleted
    anonymizedReceiver?: string; // "Deleted User" for hard deleted receivers
}

// Those mentions of hard deletions were before people told me that hard deleting isnt a good thing.
// I will remove them in the future. Also hi electrode if u read this

const messageSchema = new Schema<IMessage>({
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    replyToId: { type: String, required: false },
    repliedToMessageId: {
        type: Schema.Types.ObjectId,
        ref: 'Message',
        required: false,
    },
    editedAt: { type: Date, required: false },
    isEdited: { type: Boolean, default: false },
    senderDeleted: { type: Boolean, default: false },
    anonymizedSender: { type: String },
    receiverDeleted: { type: Boolean, default: false },
    anonymizedReceiver: { type: String },
});

// Indexing is gooooood
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, senderId: 1, createdAt: -1 });
messageSchema.index({ createdAt: -1 });

/**
 * Direct Message Model.
 */
export const Message: Model<IMessage> = mongoose.model(
    'Message',
    messageSchema,
);
