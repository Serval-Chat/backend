import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsMessageContent,
    IsUserId,
    IsLimit,
    IsMessageId,
} from '@/validation/schemas/common';
import { IsOptional } from 'class-validator';

export class UserEditMessageRequestDTO {
    @ApiProperty()
    @IsMessageContent()
    public content!: string;
}

export class GetMessagesQueryDTO {
    @ApiProperty()
    @IsUserId()
    public userId!: string;

    @ApiPropertyOptional()
    @IsLimit()
    public limit: number = 50;

    @ApiPropertyOptional()
    @IsOptional()
    @IsMessageId()
    public before?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsMessageId()
    public around?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsMessageId()
    public after?: string;
}

export class MessageIdParamDTO {
    @ApiProperty()
    @IsMessageId()
    public id!: string;
}

export class UserMessageParamsDTO {
    @ApiProperty()
    @IsUserId()
    public userId!: string;

    @ApiProperty()
    @IsMessageId()
    public messageId!: string;
}
