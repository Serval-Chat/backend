import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional } from 'class-validator';
import {
    IsName,
    IsUrlField,
    IsMessageContent,
    IsWebhookToken,
    IsFilename,
    IsMessageId,
} from '@/validation/schemas/common';
import { Transform } from 'class-transformer';
import { IEmbed, IEmbedButton } from '@/models/Embed';

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
    @IsName()
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

    @ApiPropertyOptional({
        description: 'Interactive components are not supported for webhooks',
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(8)
    public components?: IEmbedButton[];

    @ApiPropertyOptional({
        description: 'URLs that should not generate embeds',
        type: [String],
        maxItems: 25,
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(25)
    @IsUrlField({ each: true })
    @Transform(({ value }) =>
        Array.isArray(value) ? value.slice(0, 25) : value,
    )
    public noEmbedsUrls?: string[];
}

export class WebhookTokenParamDTO {
    @ApiProperty()
    @IsWebhookToken()
    public token!: string;
}

export class WebhookMessageParamDTO {
    @ApiProperty()
    @IsWebhookToken()
    public token!: string;

    @ApiProperty()
    @IsMessageId()
    public messageId!: string;
}

export class FilenameParamDTO {
    @ApiProperty()
    @IsFilename()
    public filename!: string;
}
