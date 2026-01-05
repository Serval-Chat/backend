import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsString, IsIn } from 'class-validator';

export class UpdateSettingsRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    muteNotifications?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    useDiscordStyleMessages?: boolean;

    @ApiPropertyOptional({ enum: ['left', 'right'] })
    @IsOptional()
    @IsIn(['left', 'right'])
    ownMessagesAlign?: 'left' | 'right';

    @ApiPropertyOptional({ enum: ['left', 'right'] })
    @IsOptional()
    @IsIn(['left', 'right'])
    otherMessagesAlign?: 'left' | 'right';

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    showYouLabel?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    ownMessageColor?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    otherMessageColor?: string;
}
