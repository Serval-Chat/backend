import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import {
    IsName,
    IsUrlField,
    IsMessageContent,
    IsUsername,
    IsWebhookToken,
    IsFilename,
} from '@/validation/schemas/common';
import { Transform } from 'class-transformer';

export class CreateWebhookRequestDTO {
    @ApiProperty()
    @IsName()
    name!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUrlField()
    avatarUrl?: string;
}

export class ExecuteWebhookRequestDTO {
    @ApiProperty()
    @IsMessageContent()
    content!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUsername()
    @Transform(({ value }) => typeof value === 'string' ? value.substring(0, 100) : value)
    username?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUrlField()
    avatarUrl?: string;
}

export class WebhookTokenParamDTO {
    @ApiProperty()
    @IsWebhookToken()
    token!: string;
}

export class FilenameParamDTO {
    @ApiProperty()
    @IsFilename()
    filename!: string;
}
