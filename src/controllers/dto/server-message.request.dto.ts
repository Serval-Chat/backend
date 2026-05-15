import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { IsMessageContent, IsMessageId } from '@/validation/schemas/common';
import { IEmbed } from '@/models/Embed';
import { Type } from 'class-transformer';
import {
    ValidateNested,
    IsString,
    IsArray,
    IsDefined,
    IsBoolean,
    MaxLength,
    MinLength,
    ArrayMinSize,
    ArrayMaxSize,
    IsNumber,
    IsIn,
    IsPositive,
    ValidateIf,
} from 'class-validator';
import { InteractionValue } from '@/types/interactions';
import type { MessageAttachmentType } from '@/models/Attachment';

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

export class SendMessagePollOptionDTO {
    @IsString()
    @MinLength(1)
    @MaxLength(192)
    public text!: string;

    @IsString()
    @IsOptional()
    public emoji?: string;

    @IsString()
    @IsOptional()
    public emojiType?: 'unicode' | 'custom';

    @IsString()
    @IsOptional()
    public emojiId?: string;
}

export class SendMessagePollDTO {
    @IsString()
    @MinLength(1)
    @MaxLength(192)
    public title!: string;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(10)
    @ValidateNested({ each: true })
    @Type(() => SendMessagePollOptionDTO)
    public options!: SendMessagePollOptionDTO[];

    @IsBoolean()
    public multiSelect!: boolean;

    @IsString()
    @IsOptional()
    public expiresAt?: string;
}

export class MessageAttachmentDTO {
    @IsString()
    public attachmentId!: string;

    @IsIn(['image', 'video', 'audio', 'text', 'file'])
    public type!: MessageAttachmentType;

    @IsString()
    public mimeType!: string;

    @IsString()
    public name!: string;

    @IsNumber()
    public size!: number;

    @ValidateIf(
        (attachment: MessageAttachmentDTO) =>
            attachment.type === 'image' || attachment.type === 'video',
    )
    @IsDefined()
    @IsNumber()
    @IsPositive()
    public width?: number;

    @ValidateIf(
        (attachment: MessageAttachmentDTO) =>
            attachment.type === 'image' || attachment.type === 'video',
    )
    @IsDefined()
    @IsNumber()
    @IsPositive()
    public height?: number;

    @IsBoolean()
    @IsOptional()
    public spoiler?: boolean;
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

    @ApiPropertyOptional({ description: 'Structured file attachments' })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MessageAttachmentDTO)
    public attachments?: MessageAttachmentDTO[];

    @ApiPropertyOptional({ description: 'Slash command interaction metadata' })
    @IsOptional()
    @ValidateNested()
    @Type(() => SendMessageInteractionMetadataDTO)
    public interaction?: SendMessageInteractionMetadataDTO;

    @ApiPropertyOptional({ description: 'Sticker ID' })
    @IsOptional()
    @IsMessageId()
    public stickerId?: string;

    @ApiPropertyOptional({ description: 'Poll details' })
    @IsOptional()
    @ValidateNested()
    @Type(() => SendMessagePollDTO)
    public poll?: SendMessagePollDTO;
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
