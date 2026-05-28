import { ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsOptional,
    IsBoolean,
    IsEnum,
    Matches,
    IsString,
    MaxLength,
    IsArray,
    IsObject,
    ValidateNested,
    ValidateIf,
    ValidatorConstraint,
    ValidatorConstraintInterface,
    ValidationArguments,
    ValidationOptions,
    registerDecorator,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsColor } from '@/validation/schemas/common';
import { MessageAlignmentDTO } from './common.request.dto';

export const VALID_KEYBIND_ACTION_IDS = [
    'composer.focus',
    'debug.typing.more',
    'debug.typing.less',
    'debug.theme.previous',
    'debug.theme.next',
    'theme.previous',
    'theme.next',
] as const;

export type KeybindActionId = (typeof VALID_KEYBIND_ACTION_IDS)[number];

@ValidatorConstraint({ name: 'isValidKeybindActionId', async: false })
export class IsValidKeybindActionId implements ValidatorConstraintInterface {
    public validate(value: string, _args: ValidationArguments): boolean {
        if (typeof value !== 'string') return false;
        return VALID_KEYBIND_ACTION_IDS.includes(value as KeybindActionId);
    }

    public defaultMessage(_args: ValidationArguments): string {
        return `Keybind action ID must be one of: ${VALID_KEYBIND_ACTION_IDS.join(', ')}`;
    }
}

@ValidatorConstraint({ name: 'isValidKeybindsObject', async: false })
class IsValidKeybindsObjectConstraint implements ValidatorConstraintInterface {
    public validate(value: object, _args: ValidationArguments): boolean {
        if (typeof value !== 'object' || value === null) return false;
        const obj = value as Record<string, KeybindBindingDTO | null>;
        const keys = Object.keys(obj);
        return keys.every((key) =>
            VALID_KEYBIND_ACTION_IDS.includes(key as KeybindActionId),
        );
    }

    public defaultMessage(_args: ValidationArguments): string {
        return `All keybind action IDs must be one of: ${VALID_KEYBIND_ACTION_IDS.join(', ')}`;
    }
}

export function IsValidKeybindsObject(
    validationOptions?: ValidationOptions,
): PropertyDecorator {
    return function (object: object, propertyName: string | symbol) {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName as string,
            options: validationOptions,
            constraints: [],
            validator: IsValidKeybindsObjectConstraint,
        });
    };
}

export class NotificationSoundDTO {
    @ApiPropertyOptional()
    @IsString()
    public id!: string;

    @ApiPropertyOptional()
    @IsString()
    public name!: string;

    @ApiPropertyOptional()
    @IsString()
    public url!: string;

    @ApiPropertyOptional()
    @IsBoolean()
    public enabled!: boolean;
}

export class KeybindBindingDTO {
    @ApiPropertyOptional()
    @IsString()
    public code!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public ctrl?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public alt?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public shift?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public meta?: boolean;
}

export class UpdateSettingsRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public muteNotifications?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public useDiscordStyleMessages?: boolean;

    @ApiPropertyOptional({ enum: MessageAlignmentDTO })
    @IsOptional()
    @IsEnum(MessageAlignmentDTO)
    public ownMessagesAlign?: MessageAlignmentDTO;

    @ApiPropertyOptional({ enum: MessageAlignmentDTO })
    @IsOptional()
    @IsEnum(MessageAlignmentDTO)
    public otherMessagesAlign?: MessageAlignmentDTO;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public showYouLabel?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsColor()
    public ownMessageColor?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsColor()
    public otherMessageColor?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public disableCustomUsernameFonts?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public disableCustomUsernameColors?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public disableCustomUsernameGlow?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @ValidateIf((o) => o.customFontUrl !== '')
    @Matches(/^https:\/\/fonts\.googleapis\.com\/css2\?family=[^<>\s]+$/, {
        message: 'Must be a valid Google Fonts URL',
    })
    public customFontUrl?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(100)
    public customFontFamily?: string;

    @ApiPropertyOptional({ type: [NotificationSoundDTO] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => NotificationSoundDTO)
    public notificationSounds?: NotificationSoundDTO[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public useDefaultSounds?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public use24HourTime?: boolean;

    @ApiPropertyOptional({
        additionalProperties: {
            oneOf: [
                { $ref: '#/components/schemas/KeybindBindingDTO' },
                { type: 'null' },
            ],
        },
    })
    @IsOptional()
    @IsObject()
    @IsValidKeybindsObject()
    public keybinds?: Record<string, KeybindBindingDTO | null>;
}
