import type { Document, Model, Types } from 'mongoose';
import mongoose, { Schema } from 'mongoose';
import type { IEmbed } from './Embed';
import { messageAttachmentSchema, type IMessageAttachment } from './Attachment';

export interface IPollOption {
    _id?: Types.ObjectId;
    id: string;
    text: string;
    emoji?: string;
    emojiType?: 'unicode' | 'custom';
    emojiId?: string;
    votes: Types.ObjectId[]; // Array of User IDs
}

// Poll interface
export interface IPoll {
    title: string;
    options: IPollOption[];
    multiSelect: boolean;
    expiresAt?: Date;
}

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
    poll?: IPoll;
    embeds?: IEmbed[];
    attachments?: IMessageAttachment[];
    noEmbeds?: boolean;
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
    poll: {
        type: new Schema(
            {
                title: { type: String, required: true },
                options: [
                    {
                        id: { type: String, required: true },
                        text: { type: String, required: true },
                        emoji: { type: String, required: false },
                        emojiType: { type: String, required: false },
                        emojiId: { type: String, required: false },
                        votes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
                    },
                ],
                multiSelect: { type: Boolean, default: false },
                expiresAt: { type: Date, required: false },
            },
            { _id: false },
        ),
        required: false,
    },
    embeds: { type: [Schema.Types.Mixed], default: [] },
    attachments: { type: [messageAttachmentSchema], default: [] },
    noEmbeds: { type: Boolean, default: false },
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
