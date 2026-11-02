import { mongooseIdPlugin } from '@/utils/mongooseId';
import { snowflakeIdPlugin } from '@/utils/snowflake';
import type { IMessageAttachment } from '@/models/Attachment';
import type { IEmbed, IEmbedButton } from '@/models/Embed';
import type { InteractionValue } from '@/types/interactions';
import type { PresenceStatus } from '@/types/presence';
import type { IMessageEditRevision } from '@/models/Message';
import { Schema, model, type Document } from 'mongoose';

export type ReportTargetType = 'message' | 'user';
export type ReportReason = string;
export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

export type ReportMessageEditSnapshot = IMessageEditRevision;

export interface ReportMessageSnapshot {
    text: string;
    isPartialSnapshot?: boolean;
    createdAt?: Date;
    editedAt?: Date;
    deletedAt?: Date;
    isEdited?: boolean;
    editHistory?: ReportMessageEditSnapshot[];
    isWebhook?: boolean;
    webhookUsername?: string;
    reply?: {
        id: string;
        senderId: string;
        text: string;
    };
    attachments?: IMessageAttachment[];
    embeds?: IEmbed[];
    components?: IEmbedButton[];
    poll?: {
        title: string;
        options: {
            id: string;
            text: string;
            emoji?: string;
            emojiType?: 'unicode' | 'custom';
            emojiId?: string;
            votes: number;
        }[];
        multiSelect: boolean;
        expiresAt?: Date;
    };
    stickerId?: string;
    interaction?: {
        command: string;
        options: { name: string; value: InteractionValue }[];
        user: { id: string; username: string };
    };
}

export interface ReportContextMessageSnapshot extends ReportMessageSnapshot {
    id: string;
    senderId: string;
    senderUsername?: string;
    isTarget: boolean;
}

export interface ReportUserProfileSnapshot {
    snapshotKey?: string;
    username: string;
    displayName?: string | null;
    bio?: string;
    pronouns?: string;
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
    customStatus?: { text: string; emoji?: string };
    presenceStatus?: PresenceStatus;
    isBot?: boolean;
    botVerified?: boolean;
    decorationId?: string;
    badges?: {
        id: string;
        name: string;
        description: string;
        icon: string;
        color: string;
        createdAt: Date;
    }[];
    privacySettings?: {
        privateProfile: boolean;
        hideDisplayName: boolean;
        hidePronouns: boolean;
        hideConnections: boolean;
        hideBio: boolean;
        hideStatus: boolean;
    };
    connections?: { id: string; type: 'Website'; value: string }[];
    profilePictureFile?: string;
    bannerFile?: string;
    bannerColor?: string;
    profilePrimaryColor?: string;
    profileAccentColor?: string;
    createdAt?: Date;
}

export interface IReport extends Document {
    snowflakeId: string;
    dedupeKey?: string;
    reporterId: string;
    targetType: ReportTargetType;
    targetId: string;
    reason: ReportReason;
    reasonLabel?: string;
    subReason?: string;
    subReasonLabel?: string;
    details?: string;
    serverId?: string;
    channelId?: string;
    targetUsername?: string;
    targetUserId?: string;
    messageSnapshot?: string;
    messageContent?: ReportMessageSnapshot;
    messageContext?: ReportContextMessageSnapshot[];
    userProfileSnapshot?: ReportUserProfileSnapshot;
    status: ReportStatus;
    internalNote?: string;
    reviewedBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

const schema = new Schema<IReport>(
    {
        reporterId: { type: String, required: true },
        dedupeKey: { type: String, select: false },
        targetType: {
            type: String,
            enum: ['message', 'user'],
            required: true,
        },
        targetId: { type: String, required: true },
        reason: { type: String, required: true, maxlength: 64 },
        reasonLabel: { type: String, maxlength: 80 },
        subReason: { type: String, maxlength: 64 },
        subReasonLabel: { type: String, maxlength: 80 },
        details: { type: String, maxlength: 1000 },
        serverId: String,
        channelId: String,
        targetUsername: String,
        targetUserId: String,
        messageSnapshot: { type: String },
        messageContent: { type: Schema.Types.Mixed },
        messageContext: { type: [Schema.Types.Mixed], required: false },
        userProfileSnapshot: { type: Schema.Types.Mixed, required: false },
        status: {
            type: String,
            enum: ['open', 'reviewing', 'resolved', 'dismissed'],
            default: 'open',
            required: true,
        },
        internalNote: { type: String, maxlength: 2000 },
        reviewedBy: String,
    },
    { timestamps: true },
);

schema.index({ reporterId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });
schema.index({ targetType: 1, targetId: 1, reporterId: 1 });
schema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
schema.plugin(mongooseIdPlugin);
schema.plugin(snowflakeIdPlugin);

export const Report = model<IReport>('Report', schema);
