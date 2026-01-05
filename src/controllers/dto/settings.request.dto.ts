import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { IsColor } from '@/validation/schemas/common';
import { MessageAlignmentDTO } from './common.request.dto';

export class UpdateSettingsRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    muteNotifications?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    useDiscordStyleMessages?: boolean;

    @ApiPropertyOptional({ enum: MessageAlignmentDTO })
    @IsOptional()
    @IsEnum(MessageAlignmentDTO)
    ownMessagesAlign?: MessageAlignmentDTO;

    @ApiPropertyOptional({ enum: MessageAlignmentDTO })
    @IsOptional()
    @IsEnum(MessageAlignmentDTO)
    otherMessagesAlign?: MessageAlignmentDTO;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    showYouLabel?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsColor()
    ownMessageColor?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsColor()
    otherMessageColor?: string;
}
