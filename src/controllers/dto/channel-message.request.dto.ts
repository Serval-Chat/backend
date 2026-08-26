import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import {
    IsChannelId,
    IsLimit,
    IsMessageId,
    IsBooleanQuery,
} from '@/validation/schemas/common';

export class ChannelIdParamDTO {
    @ApiProperty()
    @IsChannelId()
    public channelId!: string;
}

export class ChannelMessageIdParamDTO {
    @ApiProperty()
    @IsChannelId()
    public channelId!: string;

    @ApiProperty()
    @IsMessageId()
    public messageId!: string;
}

export class GetChannelMessagesQueryDTO {
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
