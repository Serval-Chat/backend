import type { Document, Model, Types } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

// Reaction model
//
// Stores emoji reactions for messages (both DM and server messages)
// Supports Unicode emojis and custom emojis from servers
export interface IReaction extends Document {
    _id: Types.ObjectId;
    messageId: Types.ObjectId; // Reference to Message or ServerMessage
    messageType: 'dm' | 'server'; // Type of message
    userId: Types.ObjectId; // User who reacted
    emoji: string; // Unicode emoji character OR custom emoji name
    emojiType: 'unicode' | 'custom'; // Type of emoji
    emojiId?: Types.ObjectId; // Reference to Emoji model (custom emojis only)
    createdAt: Date;
}

const reactionSchema = new Schema<IReaction>({
    messageId: {
        type: Schema.Types.ObjectId,
        required: true,
        index: true,
    },
    messageType: {
        type: String,
        enum: ['dm', 'server'],
        required: true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    emoji: {
        type: String,
        required: true,
    },
    emojiType: {
        type: String,
        enum: ['unicode', 'custom'],
        required: true,
    },
    emojiId: {
        type: Schema.Types.ObjectId,
        ref: 'Emoji',
        required: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Compound index: ensure user can only react once per emoji per message
// For Unicode emoji: (messageId, messageType, userId, emoji)
// For custom emoji: (messageId, messageType, userId, emojiId)
reactionSchema.index(
    { messageId: 1, messageType: 1, userId: 1, emoji: 1, emojiId: 1 },
    { unique: true },
);

// Index for efficient fetching of all reactions for a message
reactionSchema.index({ messageId: 1, messageType: 1 });

// Index for cleanup operations
reactionSchema.index({ userId: 1 });

export const Reaction: Model<IReaction> = mongoose.model(
    'Reaction',
    reactionSchema,
);
