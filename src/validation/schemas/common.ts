import { applyDecorators } from '@nestjs/common';
import { z } from 'zod';
import {
    IsString,
    IsMongoId,
    Matches,
    MinLength,
    MaxLength,
    IsInt,
    Min,
    Max,
    IsOptional,
    IsUrl,
    IsBoolean,
    IsISO8601,
    ValidationOptions,
    registerDecorator,
} from 'class-validator';
import { Transform } from 'class-transformer';

// --- ID Validations ---

export function IsObjectId(validationOptions?: ValidationOptions) {
    return applyDecorators(IsMongoId(validationOptions));
}

// Semantic Aliases
export const IsUserId = IsObjectId;
export const IsServerId = IsObjectId;
export const IsChannelId = IsObjectId;
export const IsMessageId = IsObjectId;
export const IsRoleId = IsObjectId;
export const IsCategoryId = IsObjectId;
export const IsEmojiId = IsObjectId;

// --- User Validations ---

export function IsUsername(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        MinLength(3, {
            ...validationOptions,
            message: 'Username must be at least 3 characters',
        }),
        MaxLength(20, {
            ...validationOptions,
            message: 'Username must be at most 20 characters',
        }),
        Matches(/^[a-zA-Z0-9_]/, {
            ...validationOptions,
            message: 'Username must start with a letter, number, or underscore',
        }),
        Matches(/^[a-zA-Z0-9_.-]+$/, {
            ...validationOptions,
            message:
                'Username can only contain letters, numbers, underscores, hyphens, and dots',
        }),
        // Custom check for consecutive dots
        (target: Object, propertyKey: string | symbol) => {
            registerDecorator({
                name: 'noConsecutiveDots',
                target: target.constructor,
                propertyName: propertyKey.toString(),
                options: {
                    ...validationOptions,
                    message: 'Username cannot contain consecutive dots',
                },
                validator: {
                    validate(value: any) {
                        return (
                            typeof value === 'string' && !value.includes('..')
                        );
                    },
                },
            });
        },
        Transform(({ value }) =>
            typeof value === 'string' ? value.trim() : value,
        ),
    );
}

export function IsLogin(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        Transform(({ value }) =>
            typeof value === 'string' ? value.trim() : value,
        ),
        MinLength(3, {
            ...validationOptions,
            message: 'Login must be at least 3 characters',
        }),
        MaxLength(50, {
            ...validationOptions,
            message: 'Login must be at most 50 characters',
        }),
    );
}

export function IsPassword(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        MinLength(6, {
            ...validationOptions,
            message: 'Password must be at least 6 characters',
        }),
        MaxLength(100, {
            ...validationOptions,
            message: 'Password must be at most 100 characters',
        }),
    );
}

export function IsStrongPassword(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        MinLength(8, {
            ...validationOptions,
            message: 'Password must be at least 8 characters',
        }),
        MaxLength(128, {
            ...validationOptions,
            message: 'Password must be at most 128 characters',
        }),
        Matches(/[a-zA-Z]/, {
            ...validationOptions,
            message: 'Password must contain at least one letter',
        }),
        Matches(/[0-9]/, {
            ...validationOptions,
            message: 'Password must contain at least one number',
        }),
        Matches(/[^a-zA-Z0-9]/, {
            ...validationOptions,
            message: 'Password must contain at least one symbol',
        }),
    );
}

export function IsBio(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        MaxLength(500, {
            ...validationOptions,
            message: 'Bio must be at most 500 characters',
        }),
        IsOptional(validationOptions),
    );
}

// --- Style & Appearance ---

export function IsColorHex(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        Matches(/^#[0-9A-Fa-f]{6}$/, {
            ...validationOptions,
            message: 'Invalid color hex format (must be #RRGGBB)',
        }),
    );
}
// Alias
export const IsColor = IsColorHex;

export function IsIntensity(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsInt(validationOptions),
        Min(0, {
            ...validationOptions,
            message: 'Intensity must be at least 0',
        }),
        Max(20, {
            ...validationOptions,
            message: 'Intensity must be at most 20',
        }),
    );
}

// --- Common Fields ---

export function IsName(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        MinLength(1, { ...validationOptions, message: 'Name is required' }),
        MaxLength(100, {
            ...validationOptions,
            message: 'Name must be at most 100 characters',
        }),
        Transform(({ value }) =>
            typeof value === 'string' ? value.trim() : value,
        ),
    );
}

export function IsInviteToken(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        MinLength(1, {
            ...validationOptions,
            message: 'Invite token is required',
        }),
        MaxLength(100, {
            ...validationOptions,
            message: 'Invite token is too long',
        }),
    );
}

export function IsWebhookToken(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        Matches(/^[a-fA-F0-9]{128}$/, {
            ...validationOptions,
            message: 'Invalid webhook token format',
        }),
    );
}

export function IsReason(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        MinLength(1, { ...validationOptions, message: 'Reason is required' }),
        MaxLength(500, {
            ...validationOptions,
            message: 'Reason must be at most 500 characters',
        }),
    );
}

export function IsMessageContent(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        Transform(({ value }) =>
            typeof value === 'string' ? value.trim() : value,
        ),
        MinLength(1, {
            ...validationOptions,
            message: 'Message content cannot be empty',
        }),
        MaxLength(2000, {
            ...validationOptions,
            message: 'Message content must be at most 2000 characters',
        }),
    );
}

export function IsUrlField(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsUrl({}, { ...validationOptions, message: 'Invalid URL format' }),
    );
}

// --- Pagination & Queries ---

export function IsLimit(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsOptional(validationOptions),
        Transform(({ value }) => (value ? parseInt(value, 10) : 50)),
        IsInt(validationOptions),
        Min(1, validationOptions),
        Max(100, validationOptions),
    );
}

export function IsOffset(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsOptional(validationOptions),
        Transform(({ value }) => (value ? parseInt(value, 10) : 0)),
        IsInt(validationOptions),
        Min(0, validationOptions),
    );
}

export function IsBooleanQuery(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsOptional(validationOptions),
        Transform(({ value }) => {
            if (!value) return undefined;
            const normalized = String(value).toLowerCase();
            return normalized === 'true' || normalized === '1';
        }),
        IsBoolean(validationOptions),
    );
}

export function IsIsoDate(validationOptions?: ValidationOptions) {
    return applyDecorators(IsISO8601({}, validationOptions));
}

export function IsEmoji(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        Transform(({ value }) =>
            typeof value === 'string' ? value.trim() : value,
        ),
        (target: Object, propertyKey: string | symbol) => {
            registerDecorator({
                name: 'isEmoji',
                target: target.constructor,
                propertyName: propertyKey.toString(),
                options: {
                    ...validationOptions,
                    message: 'Invalid emoji format',
                },
                validator: {
                    validate(value: any) {
                        if (typeof value !== 'string' || value.length === 0)
                            return true;

                        // Custom emoji format: <emoji:id>
                        const customEmojiMatch = value.match(
                            /^<emoji:([a-fA-F0-9]{24})>$/,
                        );
                        if (customEmojiMatch) return true;

                        // Standard emoji grapheme check
                        const segmenter = new Intl.Segmenter('en', {
                            granularity: 'grapheme',
                        });
                        const graphemes = Array.from(segmenter.segment(value));

                        return (
                            graphemes.length === 1 && /\p{Emoji}/u.test(value)
                        );
                    },
                },
            });
        },
    );
}

export function IsFilename(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        (target: Object, propertyKey: string | symbol) => {
            registerDecorator({
                name: 'isFilename',
                target: target.constructor,
                propertyName: propertyKey.toString(),
                options: { ...validationOptions, message: 'Invalid filename' },
                validator: {
                    validate(value: any) {
                        if (typeof value !== 'string' || value.length === 0)
                            return true;
                        return (
                            !value.includes('..') &&
                            !value.includes('/') &&
                            !value.includes('\\')
                        );
                    },
                },
            });
        },
    );
}

// --- Legacy Zod Schemas (Required by regional validation files) ---

export const objectIdSchema = z
    .string()
    .regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId format');

export const usernameSchema = z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(
        /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/,
        'Username can only contain letters, numbers, underscores, hyphens, and dots',
    )
    .refine(
        (s) => !s.includes('..'),
        'Username cannot contain consecutive dots',
    );

export const loginSchema = z
    .string()
    .min(3, 'Login must be at least 3 characters')
    .max(50, 'Login must be at most 50 characters');

export const passwordSchema = z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(100, 'Password must be at most 100 characters');

export const bioSchema = z
    .string()
    .max(500, 'Bio must be at most 500 characters');

export const nameSchema = z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters')
    .trim();

export const messageContentSchema = z
    .string()
    .min(1, 'Message content cannot be empty')
    .max(2000, 'Message content must be at most 2000 characters')
    .trim();

export const reasonSchema = z
    .string()
    .min(1, 'Reason is required')
    .max(500, 'Reason must be at most 500 characters');

export const optionalReasonSchema = reasonSchema.optional();

export const colorHexSchema = z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color hex format');

export const inviteTokenSchema = z
    .string()
    .min(1, 'Invite token is required')
    .max(100, 'Invite token is too long');

export const optionalUrlSchema = z
    .string()
    .url('Invalid URL format')
    .optional()
    .or(z.literal(''));

export const limitSchema = z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50));

export const offsetSchema = z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0));

export const searchSchema = z.string().optional();

export const filterSchema = z.string().optional();

export const booleanQuerySchema = z
    .string()
    .optional()
    .transform((val) => val === 'true' || val === '1');
