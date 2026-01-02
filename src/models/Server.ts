import type { Document, Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

// Server interface
//
// Represents a chat server
export interface IServer extends Document {
    _id: mongoose.Types.ObjectId;
    name: string;
    ownerId: mongoose.Types.ObjectId;
    icon?: string;
    banner?: {
        type: 'color' | 'image' | 'gif';
        value: string;
    };
    defaultRoleId?: mongoose.Types.ObjectId;
    disableCustomFonts?: boolean;
    createdAt: Date;
    deletedAt?: Date;
    allTimeHigh?: number;
}

// Category interface
//
// Represents a channel category
// Can override permissions for channels within it
export interface ICategory extends Document {
    _id: mongoose.Types.ObjectId;
    serverId: mongoose.Types.ObjectId;
    name: string;
    position: number;
    permissions?: {
        [roleId: string]: {
            sendMessages?: boolean;
            manageMessages?: boolean;
            deleteMessagesOfOthers?: boolean;
            manageChannels?: boolean;
            manageRoles?: boolean;
            banMembers?: boolean;
            kickMembers?: boolean;
            manageInvites?: boolean;
            manageServer?: boolean;
            administrator?: boolean;
            manageReactions?: boolean;
            addReactions?: boolean;
        };
    };
    createdAt: Date;
}

// Channel interface
//
// Represents a text or voice channel within a server
export interface IChannel extends Document {
    _id: mongoose.Types.ObjectId;
    serverId: mongoose.Types.ObjectId;
    categoryId?: mongoose.Types.ObjectId;
    name: string;
    type: 'text' | 'voice';
    position: number;
    permissions?: {
        [roleId: string]: {
            sendMessages?: boolean;
            manageMessages?: boolean;
            deleteMessagesOfOthers?: boolean;
            manageReactions?: boolean;
            addReactions?: boolean;
        };
    };
    createdAt: Date;
    lastMessageAt?: Date;
    icon?: string;
    description?: string;
}

// Server member interface
//
// Represents a user's membership in a server, including their roles
export interface IServerMember extends Document {
    _id: mongoose.Types.ObjectId;
    serverId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    roles: mongoose.Types.ObjectId[];
    joinedAt: Date;
}

// Role interface
//
// Represents a role within a server, defining permissions and styling
export interface IRole extends Document {
    _id: mongoose.Types.ObjectId;
    serverId: mongoose.Types.ObjectId;
    name: string;
    color: string;
    startColor?: string; // Gradient start color
    endColor?: string; // Gradient end color
    colors?: string[]; // Multi-color gradient array
    gradientRepeat?: number; // Number of times to repeat the gradient (1 = no repeat)
    position: number;
    permissions: {
        sendMessages: boolean;
        manageMessages: boolean;
        deleteMessagesOfOthers: boolean;
        manageChannels: boolean;
        manageRoles: boolean;
        banMembers: boolean;
        kickMembers: boolean;
        manageInvites: boolean;
        manageServer: boolean;
        administrator: boolean;
        pingRolesAndEveryone?: boolean;
        manageReactions: boolean;
        addReactions: boolean;
    };
    separateFromOtherRoles?: boolean;
    createdAt: Date;
}

// Invite interface
//
// Represents an invitation link to join a server
export interface IInvite extends Document {
    _id: mongoose.Types.ObjectId;
    serverId: mongoose.Types.ObjectId;
    code: string;
    customPath?: string;
    createdByUserId: mongoose.Types.ObjectId;
    maxUses?: number;
    uses: number;
    expiresAt?: Date;
    createdAt: Date;
}

// Server message interface
//
// Represents a message sent in a server channel
export interface IServerMessage extends Document {
    _id: mongoose.Types.ObjectId;
    serverId: mongoose.Types.ObjectId;
    channelId: mongoose.Types.ObjectId;
    senderId: mongoose.Types.ObjectId;
    text: string;
    createdAt: Date;
    replyToId?: mongoose.Types.ObjectId;
    repliedToMessageId?: mongoose.Types.ObjectId;
    editedAt?: Date;
    isEdited?: boolean;
    isWebhook?: boolean;
    webhookUsername?: string;
    webhookAvatarUrl?: string;
}

// Server ban interface
//
// Represents a user banned from a specific server
export interface IServerBan extends Document {
    _id: mongoose.Types.ObjectId;
    serverId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    bannedBy: mongoose.Types.ObjectId;
    reason?: string;
    createdAt: Date;
}

const serverSchema = new Schema<IServer>({
    name: { type: String, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    icon: { type: String },
    banner: {
        type: new Schema(
            {
                type: { type: String, enum: ['color', 'image', 'gif'] },
                value: { type: String },
            },
            { _id: false },
        ),
        required: false,
    },
    defaultRoleId: {
        type: Schema.Types.ObjectId,
        ref: 'Role',
        required: false,
    },
    disableCustomFonts: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    deletedAt: { type: Date },
    allTimeHigh: { type: Number, default: 0 },
});

const categorySchema = new Schema<ICategory>({
    serverId: { type: Schema.Types.ObjectId, ref: 'Server', required: true },
    name: { type: String, required: true },
    position: { type: Number, default: 0 },
    permissions: {
        type: Map,
        of: {
            sendMessages: { type: Boolean },
            manageMessages: { type: Boolean },
            deleteMessagesOfOthers: { type: Boolean },
            manageChannels: { type: Boolean },
            manageRoles: { type: Boolean },
            banMembers: { type: Boolean },
            kickMembers: { type: Boolean },
            manageInvites: { type: Boolean },
            manageServer: { type: Boolean },
            administrator: { type: Boolean },
            manageReactions: { type: Boolean },
            addReactions: { type: Boolean },
        },
        default: {},
    },
    createdAt: { type: Date, default: Date.now },
});
categorySchema.index({ serverId: 1, position: 1 });

const channelSchema = new Schema<IChannel>({
    serverId: { type: Schema.Types.ObjectId, ref: 'Server', required: true },
    categoryId: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
        required: false,
    },
    name: { type: String, required: true },
    type: { type: String, enum: ['text', 'voice'], default: 'text' },
    position: { type: Number, default: 0 },
    permissions: {
        type: Map,
        of: {
            sendMessages: { type: Boolean },
            manageMessages: { type: Boolean },
            deleteMessagesOfOthers: { type: Boolean },
            manageReactions: { type: Boolean },
            addReactions: { type: Boolean },
        },
        default: {},
    },
    createdAt: { type: Date, default: Date.now },
    lastMessageAt: { type: Date, default: Date.now },
    icon: { type: String },
    description: { type: String, maxlength: 200 },
});
channelSchema.index({ serverId: 1, categoryId: 1, position: 1 });
channelSchema.index({ serverId: 1, lastMessageAt: -1 });

const serverMemberSchema = new Schema<IServerMember>({
    serverId: { type: Schema.Types.ObjectId, ref: 'Server', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    roles: [{ type: Schema.Types.ObjectId, ref: 'Role' }],
    joinedAt: { type: Date, default: Date.now },
});
serverMemberSchema.index({ serverId: 1, userId: 1 }, { unique: true });

const roleSchema = new Schema<IRole>({
    serverId: { type: Schema.Types.ObjectId, ref: 'Server', required: true },
    name: { type: String, required: true },
    color: { type: String, default: '#99aab5', allow: null },
    startColor: { type: String, required: false },
    endColor: { type: String, required: false },
    colors: { type: [String], required: false }, // For multi-color gradients
    gradientRepeat: { type: Number, required: false, min: 1, max: 10 },
    position: { type: Number, default: 0 },
    permissions: {
        sendMessages: { type: Boolean, default: true },
        manageMessages: { type: Boolean, default: false },
        deleteMessagesOfOthers: { type: Boolean, default: false },
        manageChannels: { type: Boolean, default: false },
        manageRoles: { type: Boolean, default: false },
        banMembers: { type: Boolean, default: false },
        kickMembers: { type: Boolean, default: false },
        manageInvites: { type: Boolean, default: false },
        manageServer: { type: Boolean, default: false },
        administrator: { type: Boolean, default: false },
        pingRolesAndEveryone: { type: Boolean, default: false },
        manageReactions: { type: Boolean, default: false },
        addReactions: { type: Boolean, default: true },
    },
    separateFromOtherRoles: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});
roleSchema.index({ serverId: 1, position: 1 });

const inviteSchema = new Schema<IInvite>({
    serverId: { type: Schema.Types.ObjectId, ref: 'Server', required: true },
    code: { type: String, required: true, unique: true },
    customPath: { type: String, required: false, unique: true, sparse: true },
    createdByUserId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    maxUses: { type: Number, required: false },
    uses: { type: Number, default: 0 },
    expiresAt: { type: Date, required: false },
    createdAt: { type: Date, default: Date.now },
});
inviteSchema.index({ serverId: 1 });

const serverMessageSchema = new Schema<IServerMessage>({
    serverId: { type: Schema.Types.ObjectId, ref: 'Server', required: true },
    channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    replyToId: { type: Schema.Types.ObjectId, required: false },
    repliedToMessageId: {
        type: Schema.Types.ObjectId,
        ref: 'ServerMessage',
        required: false,
    },
    editedAt: { type: Date, required: false },
    isEdited: { type: Boolean, default: false },
    isWebhook: { type: Boolean, default: false },
    webhookUsername: { type: String, required: false },
    webhookAvatarUrl: { type: String, required: false },
});
serverMessageSchema.index({ channelId: 1, createdAt: -1 });

const serverBanSchema = new Schema<IServerBan>({
    serverId: { type: Schema.Types.ObjectId, ref: 'Server', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bannedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: false },
    createdAt: { type: Date, default: Date.now },
});
serverBanSchema.index({ serverId: 1, userId: 1 }, { unique: true });

export const Server: Model<IServer> = mongoose.model('Server', serverSchema);
export const Category: Model<ICategory> = mongoose.model(
    'Category',
    categorySchema,
);
export const Channel: Model<IChannel> = mongoose.model(
    'Channel',
    channelSchema,
);
export const ServerMember: Model<IServerMember> = mongoose.model(
    'ServerMember',
    serverMemberSchema,
);
export const Role: Model<IRole> = mongoose.model('Role', roleSchema);
export const Invite: Model<IInvite> = mongoose.model('Invite', inviteSchema);
export const ServerMessage: Model<IServerMessage> = mongoose.model(
    'ServerMessage',
    serverMessageSchema,
);
export const ServerBan: Model<IServerBan> = mongoose.model(
    'ServerBan',
    serverBanSchema,
);
