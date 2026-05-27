import { ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsOptional,
    IsBoolean,
    IsEnum,
    Matches,
    IsString,
    MaxLength,
    IsArray,
    ValidateNested,
    ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsColor } from '@/validation/schemas/common';
import { MessageAlignmentDTO } from './common.request.dto';

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
}
