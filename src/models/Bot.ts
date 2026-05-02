import { Schema, model } from 'mongoose';
import type { Document, Types } from 'mongoose';
import crypto from 'crypto';

export interface BotPermissions {
    readMessages: boolean;
    sendMessages: boolean;
    manageMessages: boolean;
    readUsers: boolean;
    joinServers: boolean;
    manageServer: boolean;
    manageChannels: boolean;
    manageMembers: boolean;
    readReactions: boolean;
    addReactions: boolean;
}

export const DEFAULT_BOT_PERMISSIONS: BotPermissions = {
    readMessages: false,
    sendMessages: false,
    manageMessages: false,
    readUsers: false,
    joinServers: true,
    manageServer: false,
    manageChannels: false,
    manageMembers: false,
    readReactions: false,
    addReactions: false,
};

export interface IBot extends Document {
    _id: Types.ObjectId;
    clientId: string;
    clientSecretHash: string;
    userId: Types.ObjectId;
    ownerId: Types.ObjectId;
    botPermissions: BotPermissions;
    createdAt: Date;
    updatedAt: Date;
    verifySecret(secret: string): boolean;
}

const schema = new Schema<IBot>(
    {
        clientId: { type: String, required: true, unique: true },
        clientSecretHash: { type: String, required: true, select: false },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        botPermissions: {
            readMessages: { type: Boolean, default: false },
            sendMessages: { type: Boolean, default: false },
            manageMessages: { type: Boolean, default: false },
            readUsers: { type: Boolean, default: false },
            joinServers: { type: Boolean, default: false },
            manageServer: { type: Boolean, default: false },
            manageChannels: { type: Boolean, default: false },
            manageMembers: { type: Boolean, default: false },
            readReactions: { type: Boolean, default: false },
            addReactions: { type: Boolean, default: false },
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    },
);

schema.methods.verifySecret = function (secret: string): boolean {
    const hash = crypto.createHash('sha256').update(secret).digest('hex');
    return hash === this.clientSecretHash;
};

export const Bot = model<IBot>('Bot', schema);
