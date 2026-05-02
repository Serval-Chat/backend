import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { IsColor } from '@/validation/schemas/common';
import { MessageAlignmentDTO } from './common.request.dto';

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
}
