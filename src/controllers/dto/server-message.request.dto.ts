import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsArray } from 'class-validator';

export class SendMessageRequestDTO {
    @ApiPropertyOptional({ description: 'Message content (preferred)' })
    @IsOptional()
    @IsString()
    content?: string;

    @ApiPropertyOptional({ description: 'Message text (legacy support)' })
    @IsOptional()
    @IsString()
    text?: string;

    @ApiPropertyOptional({ description: 'ID of the message being replied to' })
    @IsOptional()
    @IsString()
    replyToId?: string;
}

export class ServerEditMessageRequestDTO {
    @ApiPropertyOptional({ description: 'New message content' })
    @IsOptional()
    @IsString()
    content?: string;

    @ApiPropertyOptional({ description: 'New message text (legacy)' })
    @IsOptional()
    @IsString()
    text?: string;
}
