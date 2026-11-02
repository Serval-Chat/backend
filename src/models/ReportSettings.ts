import { Schema, model } from 'mongoose';
import type { ReportTargetType } from '@/models/Report';

export interface ReportReasonOption {
    id: string;
    targetType: ReportTargetType;
    label: string;
    enabled: boolean;
    position: number;
    deleted?: boolean;
    subcategories?: ReportReasonSubcategory[];
}

export interface ReportReasonSubcategory {
    id: string;
    label: string;
    enabled: boolean;
    position: number;
    deleted?: boolean;
}

export type ReportReasonSubcategoryInput = Pick<
    ReportReasonSubcategory,
    'label' | 'enabled'
> & { id?: string };

export type ReportReasonOptionInput = Pick<
    ReportReasonOption,
    'targetType' | 'label' | 'enabled'
> & {
    id?: string;
    subcategories?: ReportReasonSubcategoryInput[];
};

export interface ReportReasonOptionDeletions {
    reasonIds: string[];
    subcategoryIds: string[];
}

export const DEFAULT_REPORT_REASON_OPTIONS: ReportReasonOption[] = [
    {
        id: 'harassment',
        targetType: 'message',
        label: 'Harassment or bullying',
        enabled: true,
        position: 0,
        subcategories: [],
    },
    {
        id: 'hate',
        targetType: 'message',
        label: 'Hateful content',
        enabled: true,
        position: 1,
        subcategories: [],
    },
    {
        id: 'spam',
        targetType: 'message',
        label: 'Spam or scams',
        enabled: true,
        position: 2,
        subcategories: [],
    },
    {
        id: 'sexual_content',
        targetType: 'message',
        label: 'Sexual content',
        enabled: true,
        position: 3,
        subcategories: [],
    },
    {
        id: 'violence',
        targetType: 'message',
        label: 'Violence or threats',
        enabled: true,
        position: 4,
        subcategories: [],
    },
    {
        id: 'other',
        targetType: 'message',
        label: 'Other',
        enabled: true,
        position: 5,
        subcategories: [],
    },
    {
        id: 'user_impersonation',
        targetType: 'user',
        label: 'Impersonation',
        enabled: true,
        position: 0,
        subcategories: [],
    },
    {
        id: 'user_spam',
        targetType: 'user',
        label: 'Spam or scam account',
        enabled: true,
        position: 1,
        subcategories: [],
    },
    {
        id: 'user_inappropriate_profile',
        targetType: 'user',
        label: 'Inappropriate profile content',
        enabled: true,
        position: 2,
        subcategories: [],
    },
    {
        id: 'user_underage',
        targetType: 'user',
        label: 'Underage user',
        enabled: true,
        position: 3,
        subcategories: [],
    },
    {
        id: 'user_ban_evasion',
        targetType: 'user',
        label: 'Ban evasion',
        enabled: true,
        position: 4,
        subcategories: [],
    },
    {
        id: 'user_other',
        targetType: 'user',
        label: 'Other profile concern',
        enabled: true,
        position: 5,
        subcategories: [],
    },
];

const subcategorySchema = new Schema<ReportReasonSubcategory>(
    {
        id: { type: String, required: true, maxlength: 64 },
        label: { type: String, required: true, maxlength: 80 },
        enabled: { type: Boolean, required: true, default: true },
        position: { type: Number, required: true, min: 0 },
        deleted: { type: Boolean, default: false },
    },
    { _id: false },
);

const optionSchema = new Schema<ReportReasonOption>(
    {
        id: { type: String, required: true, maxlength: 64 },
        targetType: {
            type: String,
            enum: ['message', 'user'],
            required: true,
            default: 'message',
        },
        label: { type: String, required: true, maxlength: 80 },
        enabled: { type: Boolean, required: true, default: true },
        position: { type: Number, required: true, min: 0 },
        deleted: { type: Boolean, default: false },
        subcategories: { type: [subcategorySchema], default: [] },
    },
    { _id: false },
);

const schema = new Schema(
    {
        key: { type: String, required: true, unique: true, default: 'global' },
        options: {
            type: [optionSchema],
            default: DEFAULT_REPORT_REASON_OPTIONS,
        },
    },
    { timestamps: true },
);

export const ReportSettings = model('ReportSettings', schema);
