import { mongooseIdPlugin } from '@/utils/mongooseId';
import { Schema, model } from 'mongoose';
import type { Document, Types } from 'mongoose';
import crypto from 'crypto';

export const BOT_PERMISSION_KEYS = [
    'readMessages',
    'sendMessages',
    'manageMessages',
    'readUsers',
    'joinServers',
    'manageServer',
    'manageChannels',
    'manageMembers',
    'readReactions',
    'addReactions',
    'viewChannels',
    'connect',
    'deleteMessagesOfOthers',
    'manageRoles',
    'banMembers',
    'kickMembers',
    'manageInvites',
    'administrator',
    'manageWebhooks',
    'pingRolesAndEveryone',
    'manageReactions',
    'exportChannelMessages',
    'bypassSlowmode',
    'pinMessages',
    'seeDeletedMessages',
    'moderateMembers',
    'manageStickers',
] as const;

export type BotPermissionKey = (typeof BOT_PERMISSION_KEYS)[number];

export type BotPermissions = Partial<Record<BotPermissionKey, boolean>>;

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
    viewChannels: false,
    connect: false,
    deleteMessagesOfOthers: false,
    manageRoles: false,
    banMembers: false,
    kickMembers: false,
    manageInvites: false,
    administrator: false,
    manageWebhooks: false,
    pingRolesAndEveryone: false,
    manageReactions: false,
    exportChannelMessages: false,
    bypassSlowmode: false,
    pinMessages: false,
    seeDeletedMessages: false,
    moderateMembers: false,
    manageStickers: false,
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
            viewChannels: { type: Boolean, default: false },
            connect: { type: Boolean, default: false },
            deleteMessagesOfOthers: { type: Boolean, default: false },
            manageRoles: { type: Boolean, default: false },
            banMembers: { type: Boolean, default: false },
            kickMembers: { type: Boolean, default: false },
            manageInvites: { type: Boolean, default: false },
            administrator: { type: Boolean, default: false },
            manageWebhooks: { type: Boolean, default: false },
            pingRolesAndEveryone: { type: Boolean, default: false },
            manageReactions: { type: Boolean, default: false },
            exportChannelMessages: { type: Boolean, default: false },
            bypassSlowmode: { type: Boolean, default: false },
            pinMessages: { type: Boolean, default: false },
            seeDeletedMessages: { type: Boolean, default: false },
            moderateMembers: { type: Boolean, default: false },
            manageStickers: { type: Boolean, default: false },
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    },
);

schema.plugin(mongooseIdPlugin);

schema.methods.verifySecret = function (secret: string): boolean {
    const hash = crypto.createHash('sha256').update(secret).digest('hex');
    return hash === this.clientSecretHash;
};

export const Bot = model<IBot>('Bot', schema);
