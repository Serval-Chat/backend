import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { IsMessageContent, IsMessageId } from '@/validation/schemas/common';
import { IEmbed } from '@/models/Embed';
import { Type } from 'class-transformer';
import { ValidateNested, IsString, IsArray, IsDefined } from 'class-validator';
import { InteractionValue } from '@/types/interactions';

export class SendMessageInteractionOptionDTO {
    @IsString()
    public name!: string;

    @IsDefined()
    public value!: InteractionValue;

    @IsOptional()
    public type?: number;
}

export class SendMessageInteractionUserDTO {
    @IsString()
    public id!: string;

    @IsString()
    public username!: string;
}

export class SendMessageInteractionMetadataDTO {
    @IsString()
    public command!: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SendMessageInteractionOptionDTO)
    public options!: SendMessageInteractionOptionDTO[];

    @ValidateNested()
    @Type(() => SendMessageInteractionUserDTO)
    public user!: SendMessageInteractionUserDTO;
}

export class SendMessageRequestDTO {
    @ApiPropertyOptional({ description: 'Message content (preferred)' })
    @IsOptional()
    @IsMessageContent()
    public content?: string;

    @ApiPropertyOptional({ description: 'Message text (legacy support)' })
    @IsOptional()
    @IsMessageContent()
    public text?: string;

    @ApiPropertyOptional({ description: 'ID of the message being replied to' })
    @IsOptional()
    @IsMessageId()
    public replyToId?: string;

    @ApiPropertyOptional({ description: 'Rich embeds for the message' })
    @IsOptional()
    public embeds?: IEmbed[];

    @ApiPropertyOptional({ description: 'Slash command interaction metadata' })
    @IsOptional()
    @ValidateNested()
    @Type(() => SendMessageInteractionMetadataDTO)
    public interaction?: SendMessageInteractionMetadataDTO;

    @ApiPropertyOptional({ description: 'Sticker ID' })
    @IsOptional()
    @IsMessageId()
    public stickerId?: string;
}

export class ServerEditMessageRequestDTO {
    @ApiPropertyOptional({ description: 'New message content' })
    @IsOptional()
    @IsMessageContent()
    public content?: string;

    @ApiPropertyOptional({ description: 'New message text (legacy)' })
    @IsOptional()
    @IsMessageContent()
    public text?: string;
}

export class BulkDeleteMessagesRequestDTO {
    @IsArray()
    @IsString({ each: true })
    public messageIds!: string[];
}
