import { applyDecorators } from '@nestjs/common';
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
        MinLength(3, { ...validationOptions, message: 'Username must be at least 3 characters' }),
        MaxLength(20, { ...validationOptions, message: 'Username must be at most 20 characters' }),
        Matches(/^[a-zA-Z0-9_]/, {
            ...validationOptions,
            message: 'Username must start with a letter, number, or underscore',
        }),
        Matches(/^[a-zA-Z0-9_.-]+$/, {
            ...validationOptions,
            message: 'Username can only contain letters, numbers, underscores, hyphens, and dots',
        }),
        // Custom check for consecutive dots
        (target: Object, propertyKey: string | symbol) => {
            registerDecorator({
                name: 'noConsecutiveDots',
                target: target.constructor,
                propertyName: propertyKey.toString(),
                options: { ...validationOptions, message: 'Username cannot contain consecutive dots' },
                validator: {
                    validate(value: any) {
                        return typeof value === 'string' && !value.includes('..');
                    },
                },
            });
        }
    );
}

export function IsLogin(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        MinLength(3, { ...validationOptions, message: 'Login must be at least 3 characters' }),
        MaxLength(50, { ...validationOptions, message: 'Login must be at most 50 characters' })
    );
}

export function IsPassword(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        MinLength(6, { ...validationOptions, message: 'Password must be at least 6 characters' }),
        MaxLength(100, { ...validationOptions, message: 'Password must be at most 100 characters' })
    );
}

export function IsBio(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        MaxLength(500, { ...validationOptions, message: 'Bio must be at most 500 characters' }),
        IsOptional(validationOptions)
    );
}

// --- Style & Appearance ---

export function IsColorHex(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        Matches(/^#[0-9A-Fa-f]{6}$/, {
            ...validationOptions,
            message: 'Invalid color hex format (must be #RRGGBB)',
        })
    );
}
// Alias
export const IsColor = IsColorHex;

export function IsIntensity(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsInt(validationOptions),
        Min(0, { ...validationOptions, message: 'Intensity must be at least 0' }),
        Max(20, { ...validationOptions, message: 'Intensity must be at most 20' })
    );
}

// --- Common Fields ---

export function IsName(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        MinLength(1, { ...validationOptions, message: 'Name is required' }),
        MaxLength(100, { ...validationOptions, message: 'Name must be at most 100 characters' }),
        Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
    );
}

export function IsInviteToken(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        MinLength(1, { ...validationOptions, message: 'Invite token is required' }),
        MaxLength(100, { ...validationOptions, message: 'Invite token is too long' })
    );
}

export function IsReason(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        MinLength(1, { ...validationOptions, message: 'Reason is required' }),
        MaxLength(500, { ...validationOptions, message: 'Reason must be at most 500 characters' })
    );
}

export function IsMessageContent(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsString(validationOptions),
        MinLength(1, { ...validationOptions, message: 'Message content cannot be empty' }),
        MaxLength(2000, { ...validationOptions, message: 'Message content must be at most 2000 characters' })
    );
}

export function IsUrlField(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsUrl({}, { ...validationOptions, message: 'Invalid URL format' })
    );
}

// --- Pagination & Queries ---

export function IsLimit(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsOptional(validationOptions),
        Transform(({ value }) => (value ? parseInt(value, 10) : 50)),
        IsInt(validationOptions),
        Min(1, validationOptions),
        Max(100, validationOptions)
    );
}

export function IsOffset(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsOptional(validationOptions),
        Transform(({ value }) => (value ? parseInt(value, 10) : 0)),
        IsInt(validationOptions),
        Min(0, validationOptions)
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
        IsBoolean(validationOptions)
    );
}

export function IsIsoDate(validationOptions?: ValidationOptions) {
    return applyDecorators(
        IsISO8601({}, validationOptions)
    );
}
