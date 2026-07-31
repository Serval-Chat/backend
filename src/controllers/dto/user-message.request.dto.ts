import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsMessageContent,
    IsUserId,
    IsLimit,
    IsMessageId,
    IsBooleanQuery,
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

    @ApiPropertyOptional({
        description:
            'When true, small text attachments include their content inline so clients can skip a separate download request',
    })
    @IsBooleanQuery()
    public includeAttachmentContent?: boolean;
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
