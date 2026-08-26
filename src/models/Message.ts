import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { Document, Model, Types } from 'mongoose';
import mongoose, { Schema } from 'mongoose';
import type { IEmbed, IEmbedButton } from './Embed';
import { messageAttachmentSchema, type IMessageAttachment } from './Attachment';
import type { InteractionValue } from '@/types/interactions';

export interface IPollOption {
    _id?: Types.ObjectId;
    id: string;
    text: string;
    emoji?: string;
    emojiType?: 'unicode' | 'custom';
    emojiId?: string;
    votes: string[];
}

// Poll interface
export interface IPoll {
    title: string;
    options: IPollOption[];
    multiSelect: boolean;
    expiresAt?: Date;
}

export interface IMessage extends Document {
    snowflakeId: string;
    channelId: string;
    senderId: string;
    serverId?: string;
    receiverId?: string;
    text: string;
    createdAt: Date;
    replyToId?: string;
    repliedToMessageId?: string;
    stickerId?: string;
    editedAt?: Date;
    isEdited?: boolean;
    deletedAt?: Date;
    isPinned?: boolean;
    isSticky?: boolean;
    isWebhook?: boolean;
    webhookUsername?: string;
    webhookAvatarUrl?: string;
    interaction?: {
        command: string;
        options: { name: string; value: InteractionValue }[];
        user: { id: string; username: string };
    };
    senderDeleted?: boolean;
    anonymizedSender?: string;
    receiverDeleted?: boolean;
    anonymizedReceiver?: string;
    poll?: IPoll;
    embeds?: IEmbed[];
    components?: IEmbedButton[];
    attachments?: IMessageAttachment[];
    noEmbeds?: boolean;
    noEmbedsUrls?: string[];
}

const messageSchema = new Schema<IMessage>({
    senderId: { type: String, required: true },
    channelId: { type: String, required: true },
    serverId: { type: String, required: false },
    receiverId: { type: String, required: false },
    text: { type: String, required: false, default: '' },
    createdAt: { type: Date, default: Date.now },
    replyToId: { type: String, required: false },
    repliedToMessageId: {
        type: String,
        required: false,
    },
    stickerId: { type: String, required: false },
    editedAt: { type: Date, required: false },
    isEdited: { type: Boolean, default: false },
    deletedAt: { type: Date, required: false },
    isPinned: { type: Boolean, default: false },
    isSticky: { type: Boolean, default: false },
    isWebhook: { type: Boolean, default: false },
    webhookUsername: { type: String, required: false },
    webhookAvatarUrl: { type: String, required: false },
    interaction: {
        command: { type: String, required: false },
        options: [
            {
                name: { type: String, required: false },
                value: { type: Schema.Types.Mixed, required: false },
            },
        ],
        user: {
            id: { type: String, required: false },
            username: { type: String, required: false },
        },
    },
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
                        votes: [{ type: String }],
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
    components: { type: [Schema.Types.Mixed], default: [] },
    attachments: { type: [messageAttachmentSchema], default: [] },
    noEmbeds: { type: Boolean, default: false },
    noEmbedsUrls: { type: [String], default: [] },
});

messageSchema.plugin(mongooseIdPlugin);

messageSchema.plugin(snowflakeIdPlugin);

messageSchema.virtual('repliedToMessage', {
    ref: 'Message',
    localField: 'repliedToMessageId',
    foreignField: 'snowflakeId',
    justOne: true,
});

messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, senderId: 1, createdAt: -1 });
messageSchema.index({ createdAt: -1 });
messageSchema.index({ channelId: 1, createdAt: -1 });
messageSchema.index({ channelId: 1, deletedAt: 1, createdAt: -1 });
messageSchema.index({ serverId: 1 });

export const Message: Model<IMessage> = mongoose.model(
    'Message',
    messageSchema,
);
