import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import {
    IsMessageContent,
    IsMessageId,
} from '@/validation/schemas/common';

export class SendMessageRequestDTO {
    @ApiPropertyOptional({ description: 'Message content (preferred)' })
    @IsOptional()
    @IsMessageContent()
    content?: string;

    @ApiPropertyOptional({ description: 'Message text (legacy support)' })
    @IsOptional()
    @IsMessageContent()
    text?: string;

    @ApiPropertyOptional({ description: 'ID of the message being replied to' })
    @IsOptional()
    @IsMessageId()
    replyToId?: string;
}

export class ServerEditMessageRequestDTO {
    @ApiPropertyOptional({ description: 'New message content' })
    @IsOptional()
    @IsMessageContent()
    content?: string;

    @ApiPropertyOptional({ description: 'New message text (legacy)' })
    @IsOptional()
    @IsMessageContent()
    text?: string;
}
