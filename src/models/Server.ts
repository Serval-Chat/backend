import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { Document, Model, Types } from 'mongoose';
import mongoose, { Schema } from 'mongoose';
import type { IEmbed, IEmbedButton } from './Embed';
import type { InteractionValue } from '@/types/interactions';
import type { IPoll } from './Message';
import { messageAttachmentSchema, type IMessageAttachment } from './Attachment';
import {
    getPermissionDefault,
    PERMISSION_KEYS,
    type PermissionKey,
    type Permissions,
} from '@/permissions/types';

interface MarkdownBlockadeRule {
    targetType: 'everyone' | 'role' | 'user';
    targetId: string;
    features: string[];
}

// Server interface
//
// Represents a chat server
export interface IServer extends Document {
    snowflakeId: string;
    _id: mongoose.Types.ObjectId;
    name: string;
    ownerId: string;
    icon?: string;
    description?: string;
    banner?: {
        type: 'color' | 'image' | 'gif';
        value: string;
    };
    defaultRoleId?: string;
    disableCustomFonts?: boolean;
    disableUsernameGlowAndCustomColor?: boolean;
    markdownBlockadeRules?: MarkdownBlockadeRule[];
    verified?: boolean;
    verificationScore?: number;
    verificationEligible?: boolean;
    verificationLastComputedAt?: Date;
    verificationFailureReasons?: string[];
    verificationOverride?: 'verified' | 'unverified' | null;
    verificationRequested?: boolean;
    discoveryEnabled?: boolean;
    onboarding?: {
        enabled: boolean;
        guidelines: string[];
        selfAssignableRoleIds: string[];
        landingChannelId?: string | null;
        welcomeChannelIds: string[];
    };
    createdAt: Date;
    deletedAt?: Date;
    allTimeHigh?: number;
    tags?: string[];
}

export interface IServerVerificationStats extends Document {
    snowflakeId: string;
    key: string;
    p80Threshold: number;
    p65Threshold: number;
    p95T: number;
    p95M: number;
    p95B: number;
    eligibleServerCount: number;
    verifiedServerCount: number;
    lastRunAt: Date;
}

// Category interface
//
// Represents a channel category
// Can override permissions for channels within it
export interface ICategory extends Document {
    snowflakeId: string;
    _id: mongoose.Types.ObjectId;
    serverId: string;
    name: string;
    position: number;
    permissions?: {
        [roleId: string]: Permissions;
    };
    markdownBlockadeRules?: MarkdownBlockadeRule[];
    createdAt: Date;
}

// Channel interface
//
// Represents a text or voice channel within a server
export interface IChannel extends Document {
    snowflakeId: string;
    _id: mongoose.Types.ObjectId;
    serverId: string;
    categoryId?: string;
    name: string;
    type: 'text' | 'voice' | 'link';
    position: number;
    permissions?: {
        [roleId: string]: Permissions;
    };
    markdownBlockadeRules?: MarkdownBlockadeRule[];
    createdAt: Date;
    lastMessageAt?: Date;
    lastExportAt?: Date;
    icon?: string;
    emoji?: string;
    emojiType?: 'custom' | 'unicode';
    description?: string;
    link?: string;
    slowMode?: number;
}

// Server member interface
//
// Represents a user's membership in a server, including their roles
export interface IServerMember extends Document {
    snowflakeId: string;
    _id: mongoose.Types.ObjectId;
    serverId: string;
    userId: string;
    nickname?: string;
    roles: string[];
    joinedAt: Date;
    communicationDisabledUntil?: Date;
    onboardingRequired?: boolean;
    rulesAcceptedAt?: Date | null;
    onboardingCompletedAt?: Date | null;
    hiddenChannelIds?: string[];
    hiddenCategoryIds?: string[];
}

// Role interface
//
// Represents a role within a server, defining permissions and styling
export interface IRole extends Document {
    snowflakeId: string;
    _id: mongoose.Types.ObjectId;
    serverId: string;
    name: string;
    color: string;
    startColor?: string; // Gradient start color
    endColor?: string; // Gradient end color
    colors?: string[]; // Multi-color gradient array
    gradientRepeat?: number; // Number of times to repeat the gradient (1 = no repeat)
    position: number;
    permissions: Record<PermissionKey, boolean>;
    separateFromOtherRoles?: boolean;
    description?: string;
    icon?: string;
    managed: boolean;
    managedBotId?: string;
    glowEnabled: boolean;
    createdAt: Date;
}

// Invite interface
//
// Represents an invitation link to join a server
export interface IInvite extends Document {
    snowflakeId: string;
    _id: mongoose.Types.ObjectId;
    serverId: string;
    code: string;
    customPath?: string;
    createdByUserId: string;
    maxUses?: number;
    uses: number;
    expiresAt?: Date;
    createdAt: Date;
}

// Server message interface
//
// Represents a message sent in a server channel
export interface IServerMessage {
    snowflakeId: string;
    _id: Types.ObjectId;
    text: string;
    senderId: string;
    serverId: string;
    channelId: string;
    replyToId?: string;
    repliedToMessageId?: string;
    repliedTo?: {
        messageId: string;
        senderId: string;
        senderUsername?: string;
        text: string;
    };
    isEdited?: boolean;
    editedAt?: Date;
    isPinned?: boolean;
    isSticky?: boolean;
    deletedAt?: Date;
    createdAt: Date;
    isWebhook?: boolean;
    webhookUsername?: string;
    webhookAvatarUrl?: string;
    embeds?: IEmbed[];
    components?: IEmbedButton[];
    attachments?: IMessageAttachment[];
    interaction?: {
        command: string;
        options: { name: string; value: InteractionValue }[];
        user: { id: string; username: string };
    };
    stickerId?: string;
    poll?: IPoll;
    noEmbeds?: boolean;
}

// Server ban interface
//
// Represents a user banned from a specific server
export interface IServerBan extends Document {
    snowflakeId: string;
    _id: mongoose.Types.ObjectId;
    serverId: string;
    userId: string;
    bannedBy: string;
    reason?: string;
    createdAt: Date;
}

const serverSchema = new Schema<IServer>({
    name: { type: String, required: true },
    ownerId: { type: String, required: true },
    icon: { type: String },
    description: { type: String, maxlength: 500, default: '' },
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
        type: String,
        required: false,
    },
    disableCustomFonts: { type: Boolean, default: false },
    disableUsernameGlowAndCustomColor: { type: Boolean, default: false },
    markdownBlockadeRules: {
        type: [
            new Schema(
                {
                    targetType: {
                        type: String,
                        enum: ['everyone', 'role', 'user'],
                        required: true,
                    },
                    targetId: { type: String, required: true },
                    features: { type: [String], default: [] },
                },
                { _id: false },
            ),
        ],
        default: [],
    },
    verified: { type: Boolean, default: false },
    verificationScore: { type: Number, default: 0 },
    verificationEligible: { type: Boolean, default: false },
    verificationLastComputedAt: { type: Date },
    verificationFailureReasons: { type: [String], default: [] },
    verificationOverride: {
        type: String,
        enum: ['verified', 'unverified', null],
        default: null,
    },
    verificationRequested: { type: Boolean, default: false },
    discoveryEnabled: { type: Boolean, default: false },
    onboarding: {
        type: new Schema(
            {
                enabled: { type: Boolean, default: false },
                guidelines: {
                    type: [{ type: String, maxlength: 500 }],
                    validate: [
                        {
                            validator: (v: string[]) => v.length <= 20,
                            message: 'Max 20 guidelines allowed',
                        },
                    ],
                    default: [],
                },
                selfAssignableRoleIds: [{ type: String }],
                landingChannelId: {
                    type: String,
                    default: null,
                },
                welcomeChannelIds: [{ type: String }],
            },
            { _id: false },
        ),
        default: {
            enabled: false,
            guidelines: [],
            selfAssignableRoleIds: [],
            landingChannelId: null,
            welcomeChannelIds: [],
        },
    },
    createdAt: { type: Date, default: Date.now },
    deletedAt: { type: Date },
    allTimeHigh: { type: Number, default: 0 },
    tags: {
        type: [String],
        default: [],
        validate: [
            {
                validator: (v: string[]) => v.length <= 8,
                message: 'Max 8 tags allowed',
            },
        ],
    },
});

const serverVerificationStatsSchema = new Schema<IServerVerificationStats>({
    key: { type: String, required: true, unique: true },
    p80Threshold: { type: Number, default: 0 },
    p65Threshold: { type: Number, default: 0 },
    p95T: { type: Number, default: 0 },
    p95M: { type: Number, default: 0 },
    p95B: { type: Number, default: 0 },
    eligibleServerCount: { type: Number, default: 0 },
    verifiedServerCount: { type: Number, default: 0 },
    lastRunAt: { type: Date, default: Date.now },
});

const permissionOverrideSchemaDefinition = Object.fromEntries(
    PERMISSION_KEYS.map((key) => [key, { type: Boolean }]),
);

const rolePermissionSchemaDefinition = Object.fromEntries(
    PERMISSION_KEYS.map((key) => [
        key,
        { type: Boolean, default: getPermissionDefault(key) },
    ]),
);

const categorySchema = new Schema<ICategory>({
    serverId: { type: String, required: true },
    name: { type: String, required: true },
    position: { type: Number, default: 0 },
    permissions: {
        type: Map,
        of: new Schema(permissionOverrideSchemaDefinition, { _id: false }),
        default: {},
    },
    markdownBlockadeRules: {
        type: [
            new Schema(
                {
                    targetType: {
                        type: String,
                        enum: ['everyone', 'role', 'user'],
                        required: true,
                    },
                    targetId: { type: String, required: true },
                    features: { type: [String], default: [] },
                },
                { _id: false },
            ),
        ],
        default: [],
    },
    createdAt: { type: Date, default: Date.now },
});
categorySchema.index({ serverId: 1, position: 1 });

const channelSchema = new Schema<IChannel>({
    serverId: { type: String, required: true },
    categoryId: {
        type: String,
        required: false,
    },
    name: { type: String, required: true },
    type: { type: String, enum: ['text', 'voice', 'link'], default: 'text' },
    position: { type: Number, default: 0 },
    permissions: {
        type: Map,
        of: new Schema(permissionOverrideSchemaDefinition, { _id: false }),
        default: {},
    },
    markdownBlockadeRules: {
        type: [
            new Schema(
                {
                    targetType: {
                        type: String,
                        enum: ['everyone', 'role', 'user'],
                        required: true,
                    },
                    targetId: { type: String, required: true },
                    features: { type: [String], default: [] },
                },
                { _id: false },
            ),
        ],
        default: [],
    },
    createdAt: { type: Date, default: Date.now },
    lastMessageAt: { type: Date, default: Date.now },
    lastExportAt: { type: Date },
    icon: { type: String },
    emoji: { type: String },
    emojiType: { type: String, enum: ['custom', 'unicode'] },
    description: { type: String, maxlength: 200 },
    link: { type: String, required: false },
    slowMode: { type: Number, default: 0 },
});
channelSchema.index({ serverId: 1, categoryId: 1, position: 1 });
channelSchema.index({ serverId: 1, lastMessageAt: -1 });

const serverMemberSchema = new Schema<IServerMember>({
    serverId: { type: String, required: true },
    userId: { type: String, required: true },
    nickname: { type: String, maxlength: 32, required: false },
    roles: [{ type: String }],
    joinedAt: { type: Date, default: Date.now },
    communicationDisabledUntil: { type: Date, default: null },
    onboardingRequired: { type: Boolean, default: false },
    rulesAcceptedAt: { type: Date, default: null },
    onboardingCompletedAt: { type: Date, default: null },
    hiddenChannelIds: [{ type: String }],
    hiddenCategoryIds: [{ type: String }],
});
serverMemberSchema.index({ serverId: 1, userId: 1 }, { unique: true });

const roleSchema = new Schema<IRole>({
    serverId: { type: String, required: true },
    name: { type: String, required: true },
    color: { type: String, default: '#99aab5', allow: null },
    startColor: { type: String, required: false },
    endColor: { type: String, required: false },
    colors: { type: [String], required: false }, // For multi-color gradients
    gradientRepeat: { type: Number, required: false, min: 1, max: 10 },
    position: { type: Number, default: 0 },
    permissions: rolePermissionSchemaDefinition,
    separateFromOtherRoles: { type: Boolean, default: false },
    description: { type: String, maxlength: 200, required: false },
    icon: { type: String, required: false },
    managed: { type: Boolean, default: false },
    managedBotId: { type: String, required: false },
    glowEnabled: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
});
roleSchema.index({ serverId: 1, position: 1 });

const inviteSchema = new Schema<IInvite>({
    serverId: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    customPath: { type: String, required: false, unique: true, sparse: true },
    createdByUserId: {
        type: String,
        required: true,
    },
    maxUses: { type: Number, required: false },
    uses: { type: Number, default: 0 },
    expiresAt: { type: Date, required: false },
    createdAt: { type: Date, default: Date.now },
});
inviteSchema.index({ serverId: 1 });

const serverMessageSchema = new Schema<IServerMessage>({
    serverId: { type: String, required: true },
    channelId: { type: String, required: true },
    senderId: { type: String, required: true },
    text: { type: String, required: false },
    createdAt: { type: Date, default: Date.now },
    replyToId: { type: String, required: false },
    repliedToMessageId: {
        type: String,
        required: false,
    },
    repliedTo: {
        messageId: { type: String, required: false },
        senderId: { type: String, required: false },
        senderUsername: { type: String, required: false },
        text: { type: String, required: false },
    },
    editedAt: { type: Date, required: false },
    isEdited: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
    isSticky: { type: Boolean, default: false },
    deletedAt: { type: Date, required: false },
    isWebhook: { type: Boolean, default: false },
    webhookUsername: { type: String, required: false },
    webhookAvatarUrl: { type: String, required: false },
    embeds: { type: [Schema.Types.Mixed], default: [] },
    components: { type: [Schema.Types.Mixed], default: [] },
    attachments: { type: [messageAttachmentSchema], default: [] },
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
    stickerId: { type: String, required: false },
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
    noEmbeds: { type: Boolean, default: false },
});
serverMessageSchema.index({ channelId: 1, deletedAt: 1, createdAt: -1 });
serverMessageSchema.index({ channelId: 1, createdAt: -1 });

const serverBanSchema = new Schema<IServerBan>({
    serverId: { type: String, required: true },
    userId: { type: String, required: true },
    bannedBy: { type: String, required: true },
    reason: { type: String, required: false },
    createdAt: { type: Date, default: Date.now },
});

serverSchema.plugin(mongooseIdPlugin);

serverSchema.plugin(snowflakeIdPlugin);
serverVerificationStatsSchema.plugin(mongooseIdPlugin);
serverVerificationStatsSchema.plugin(snowflakeIdPlugin);
categorySchema.plugin(mongooseIdPlugin);
categorySchema.plugin(snowflakeIdPlugin);
channelSchema.plugin(mongooseIdPlugin);
channelSchema.plugin(snowflakeIdPlugin);
serverMemberSchema.plugin(mongooseIdPlugin);
serverMemberSchema.plugin(snowflakeIdPlugin);

serverMemberSchema.virtual('userIdUser', {
    ref: 'User',
    localField: 'userId',
    foreignField: 'snowflakeId',
    justOne: true,
});
roleSchema.plugin(mongooseIdPlugin);
roleSchema.plugin(snowflakeIdPlugin);
inviteSchema.plugin(mongooseIdPlugin);
inviteSchema.plugin(snowflakeIdPlugin);
serverMessageSchema.plugin(mongooseIdPlugin);
serverMessageSchema.plugin(snowflakeIdPlugin);

serverMessageSchema.virtual('repliedToMessage', {
    ref: 'ServerMessage',
    localField: 'repliedToMessageId',
    foreignField: 'snowflakeId',
    justOne: true,
});
serverBanSchema.plugin(mongooseIdPlugin);
serverBanSchema.plugin(snowflakeIdPlugin);

serverBanSchema.index({ serverId: 1, userId: 1 }, { unique: true });

export const Server: Model<IServer> = mongoose.model('Server', serverSchema);
export const ServerVerificationStats: Model<IServerVerificationStats> =
    mongoose.model('ServerVerificationStats', serverVerificationStatsSchema);
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
