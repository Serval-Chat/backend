import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import {
    IsName,
    IsUrlField,
    IsMessageContent,
    IsUsername,
} from '@/validation/schemas/common';

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
    username?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUrlField()
    avatarUrl?: string;
}
