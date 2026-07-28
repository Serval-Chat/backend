import {
    registerDecorator,
    type ValidationArguments,
    type ValidationOptions,
} from 'class-validator';
import { isValidSnowflakeId } from '@/utils/snowflake';

export enum FrequentlyUsedEmojiTypeDTO {
    UNICODE = 'unicode',
    CUSTOM = 'custom',
}

// Validates `emoji` against the sibling `emojiType`:
// - unicode: must be a single emoji grapheme
// - custom: treated as a display name/shortcode, only bounded by length
// (already enforced by `@MaxLength` alone would not be type-aware, hence a
// custom validator instead of stacking `@ValidateIf`, which would gate every
// decorator on the property rather than just the unicode-only check).
export function IsFrequentlyUsedEmojiValue(
    validationOptions?: ValidationOptions,
) {
    return function (target: object, propertyKey: string | symbol) {
        registerDecorator({
            name: 'isFrequentlyUsedEmojiValue',
            target: target.constructor,
            propertyName: propertyKey.toString(),
            options: {
                ...validationOptions,
                message:
                    'emoji must be a non-empty string of at most 100 characters, and a valid unicode emoji when emojiType is "unicode"',
            },
            validator: {
                validate(value: unknown, args: ValidationArguments): boolean {
                    if (typeof value !== 'string') return false;
                    if (value.length === 0 || value.length > 100) return false;
                    const obj = args.object as { emojiType?: string };
                    if (obj.emojiType === FrequentlyUsedEmojiTypeDTO.UNICODE) {
                        return /^[\p{Emoji}\p{Emoji_Component}]+$/u.test(value);
                    }
                    return true;
                },
            },
        });
    };
}

// Requires a valid snowflake id when emojiType is "custom", and forbids
// emojiId entirely otherwise - enforces the shape without ever checking
// whether the referenced custom emoji actually exists.
export function IsFrequentlyUsedEmojiId(validationOptions?: ValidationOptions) {
    return function (target: object, propertyKey: string | symbol) {
        registerDecorator({
            name: 'isFrequentlyUsedEmojiId',
            target: target.constructor,
            propertyName: propertyKey.toString(),
            options: {
                ...validationOptions,
                message:
                    'emojiId is required and must be a valid id when emojiType is "custom", and must be omitted otherwise',
            },
            validator: {
                validate(value: unknown, args: ValidationArguments): boolean {
                    const obj = args.object as { emojiType?: string };
                    if (obj.emojiType === FrequentlyUsedEmojiTypeDTO.CUSTOM) {
                        return isValidSnowflakeId(value);
                    }
                    return value === undefined;
                },
            },
        });
    };
}
