import type { Document, Types } from 'mongoose';
import { Schema, model } from 'mongoose';
import bcrypt from 'bcrypt';
import type { AdminPermissions } from '@/permissions/AdminPermissions';

export enum MessageAlignment {
    LEFT = 'left',
    RIGHT = 'right',
}

// User interface
//
// Represents a registered user in the system
// Includes profile settings, permissions, and security fields
export interface IUser extends Document {
    _id: Types.ObjectId;
    login: string;
    username: string;
    password: string;
    isBot?: boolean;
    profilePicture?: string;
    usernameFont?: string; // Stored as a string but typed by Mongoose enum
    usernameGradient?: {
        enabled: boolean;
        colors: string[];
        angle: number;
    };
    usernameGlow?: {
        enabled: boolean;
        color: string;
        intensity: number;
    };
    language?: string;
    customStatus?: {
        text: string;
        emoji?: string;
        expiresAt: Date | null;
        updatedAt: Date;
    } | null;
    createdAt: Date;
    permissions?: AdminPermissions;
    deletedAt?: Date;
    deletedReason?: string;
    anonymizedUsername?: string;
    tokenVersion?: number; // For JWT invalidation (global logout)
    displayName?: string;
    bio?: string;
    pronouns?: string;
    badges?: string[]; // Array of badge IDs
    totpSecret?: string | null;
    totpEnabled?: boolean;
    totpVerifiedAt?: Date | null;
    backupCodes?: string[];
    totpVerifyFailures?: number;
    totpLockedUntil?: Date | null;
    notificationPreferences?: {
        mention: boolean;
        friend_request: boolean;
        custom: boolean;
    };
    settings?: {
        muteNotifications?: boolean;
        useDiscordStyleMessages?: boolean;
        ownMessagesAlign?: MessageAlignment;
        otherMessagesAlign?: MessageAlignment;
        showYouLabel?: boolean;
        ownMessageColor?: string;
        otherMessageColor?: string;
        disableCustomUsernameFonts?: boolean;
        disableCustomUsernameColors?: boolean;
        disableCustomUsernameGlow?: boolean;
        customFontUrl?: string;
        customFontFamily?: string;
        notificationSounds?: {
            id: string;
            name: string;
            url: string;
            enabled: boolean;
        }[];
        useDefaultSounds?: boolean;
    };
    banner?: string;
    bannerColor?: string;
    serverSettings?: {
        order: (
            | string
            | { id: string; name: string; color: string; serverIds: string[] }
        )[];
    };
    comparePassword(candidate: string): Promise<boolean>;
}

export const VALID_FONTS = [
    'default',
    'Audiowide',
    'Bebas Neue',
    'Betania Patmos',
    'Google Sans Code',
    'Noto Sans',
    'Pacifico',
    'Playpen Sans Deva',
    'Rampart One',
    'Roboto',
    'Workbench',
];

const schema = new Schema<IUser>(
    {
        login: { type: String, required: true, unique: true },
        username: { type: String, required: true, unique: true },
        displayName: { type: String, maxlength: 32, trim: true },
        password: { type: String, required: true },
        isBot: { type: Boolean, default: false },
        profilePicture: { type: String, required: false },
        usernameFont: {
            type: String,
            enum: VALID_FONTS,
            required: false,
            default: 'default',
        },
        usernameGradient: {
            enabled: { type: Boolean, default: false },
            colors: { type: [String], default: ['#ffffff', '#ffffff'] },
            angle: { type: Number, default: 90 },
        },
        usernameGlow: {
            enabled: { type: Boolean, default: false },
            color: { type: String, default: '#ffffff' },
            intensity: { type: Number, default: 5 },
        },
        language: { type: String, required: false, default: 'en' },
        customStatus: {
            type: new Schema(
                {
                    text: { type: String, maxlength: 120 },
                    emoji: { type: String, maxlength: 64 },
                    expiresAt: { type: Date, default: null },
                    updatedAt: { type: Date, default: Date.now },
                },
                { _id: false },
            ),
            default: null,
        },
        createdAt: { type: Date, default: Date.now },
        permissions: {
            adminAccess: { type: Boolean, default: false },
            viewUsers: { type: Boolean, default: false },
            manageUsers: { type: Boolean, default: false },
            manageBadges: { type: Boolean, default: false },
            banUsers: { type: Boolean, default: false },
            viewBans: { type: Boolean, default: false },
            warnUsers: { type: Boolean, default: false },
            viewLogs: { type: Boolean, default: false },
            manageServer: { type: Boolean, default: false },
            manageInvites: { type: Boolean, default: false },
        },
        deletedAt: { type: Date },
        deletedReason: { type: String },
        anonymizedUsername: { type: String },
        tokenVersion: { type: Number, default: 0 },
        bio: { type: String, maxlength: 500, trim: true },
        pronouns: { type: String, maxlength: 60, trim: true },
        badges: { type: [String], default: [] },
        totpSecret: { type: String, default: null },
        totpEnabled: { type: Boolean, default: false },
        totpVerifiedAt: { type: Date, default: null },
        backupCodes: { type: [String], default: [] },
        totpVerifyFailures: { type: Number, default: 0 },
        totpLockedUntil: { type: Date, default: null },
        settings: {
            muteNotifications: { type: Boolean, default: false },
            useDiscordStyleMessages: { type: Boolean, default: false },
            ownMessagesAlign: {
                type: String,
                enum: Object.values(MessageAlignment),
                default: MessageAlignment.RIGHT,
            },
            otherMessagesAlign: {
                type: String,
                enum: Object.values(MessageAlignment),
                default: MessageAlignment.LEFT,
            },
            showYouLabel: { type: Boolean, default: true },
            ownMessageColor: { type: String, default: '#5865f2' },
            otherMessageColor: { type: String, default: '#5865f2' },
            disableCustomUsernameFonts: { type: Boolean, default: false },
            disableCustomUsernameColors: { type: Boolean, default: false },
            disableCustomUsernameGlow: { type: Boolean, default: false },
            customFontUrl: { type: String, default: '' },
            customFontFamily: { type: String, default: '' },
            notificationSounds: {
                type: [
                    new Schema(
                        {
                            id: { type: String, required: true },
                            name: { type: String, required: true },
                            url: { type: String, required: true },
                            enabled: { type: Boolean, default: true },
                        },
                        { _id: false },
                    ),
                ],
                default: [],
            },
            useDefaultSounds: { type: Boolean, default: true },
        },
        notificationPreferences: {
            type: {
                mention: { type: Boolean, default: true },
                friend_request: { type: Boolean, default: true },
                custom: { type: Boolean, default: true },
            },
            default: () => ({
                mention: true,
                friend_request: true,
                custom: true,
            }),
        },
        banner: { type: String, required: false },
        bannerColor: { type: String, required: false },
        serverSettings: {
            order: {
                type: [Schema.Types.Mixed],
                default: [],
            },
        },
    },
    {
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    },
);

// Virtual getter for deleted status based on deletedAt
schema.virtual('deleted').get(function () {
    return !!this.deletedAt;
});

// Virtual getter for display username
//
// Returns the anonymized username if the user is soft-deleted,
// Otherwise returns the real username
schema.virtual('displayUsername').get(function () {
    return this.deletedAt !== undefined &&
        this.anonymizedUsername !== undefined &&
        this.anonymizedUsername !== ''
        ? this.anonymizedUsername
        : this.username;
});

schema.post('init', function (doc) {
    if (
        typeof doc.usernameFont === 'string' &&
        !VALID_FONTS.includes(doc.usernameFont)
    ) {
        doc.usernameFont = 'default';
    }
});

schema.pre('validate', function (next) {
    if (
        typeof this.usernameFont === 'string' &&
        !VALID_FONTS.includes(this.usernameFont)
    ) {
        this.usernameFont = 'default';
    }
    next();
});

schema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

schema.methods.comparePassword = function (candidate: string) {
    return bcrypt.compare(candidate, this.password);
};

// User model
export const User = model<IUser>('User', schema);
