import type { Document, Types } from 'mongoose';
import { Schema, model } from 'mongoose';
import bcrypt from 'bcrypt';
import type { AdminPermissions } from '@/routes/api/v1/admin/permissions';

// User interface
//
// Represents a registered user in the system
// Includes profile settings, permissions, and security fields
export interface IUser extends Document {
    _id: Types.ObjectId;
    login: string;
    username: string;
    password: string;
    profilePicture?: string;
    usernameFont?: string;
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
    settings?: {
        muteNotifications?: boolean;
        useDiscordStyleMessages?: boolean;
        ownMessagesAlign?: 'left' | 'right';
        otherMessagesAlign?: 'left' | 'right';
        showYouLabel?: boolean;
        ownMessageColor?: string;
        otherMessageColor?: string;
    };
    banner?: string;
    comparePassword(candidate: string): Promise<boolean>;
}

const schema = new Schema<IUser>(
    {
        login: { type: String, required: true, unique: true },
        username: { type: String, required: true, unique: true },
        displayName: { type: String, maxlength: 32, trim: true },
        password: { type: String, required: true },
        profilePicture: { type: String, required: false },
        usernameFont: { type: String, required: false, default: 'default' },
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
        settings: {
            muteNotifications: { type: Boolean, default: false },
            useDiscordStyleMessages: { type: Boolean, default: false },
            ownMessagesAlign: {
                type: String,
                enum: ['left', 'right'],
                default: 'right',
            },
            otherMessagesAlign: {
                type: String,
                enum: ['left', 'right'],
                default: 'left',
            },
            showYouLabel: { type: Boolean, default: true },
            ownMessageColor: { type: String, default: '#5865f2' },
            otherMessageColor: { type: String, default: '#5865f2' },
        },
        banner: { type: String, required: false },
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
    return this.deletedAt && this.anonymizedUsername
        ? this.anonymizedUsername
        : this.username;
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
