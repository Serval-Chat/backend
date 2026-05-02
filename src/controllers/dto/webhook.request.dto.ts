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
import { IEmbed } from '@/models/Embed';

export class CreateWebhookRequestDTO {
    @ApiProperty()
    @IsName()
    public name!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUrlField()
    public avatarUrl?: string;
}

export class ExecuteWebhookRequestDTO {
    @ApiPropertyOptional({ description: 'Message content' })
    @IsOptional()
    @IsMessageContent()
    public content?: string;

    @ApiPropertyOptional({ description: 'Custom username for the webhook' })
    @IsOptional()
    @IsUsername()
    @Transform(({ value }) =>
        typeof value === 'string' ? value.substring(0, 100) : value,
    )
    public username?: string;

    @ApiPropertyOptional({ description: 'Custom avatar URL for the webhook' })
    @IsOptional()
    @IsUrlField()
    public avatarUrl?: string;

    @ApiPropertyOptional({ description: 'Rich embeds for the message' })
    @IsOptional()
    public embeds?: IEmbed[];
}

export class WebhookTokenParamDTO {
    @ApiProperty()
    @IsWebhookToken()
    public token!: string;
}

export class FilenameParamDTO {
    @ApiProperty()
    @IsFilename()
    public filename!: string;
}
