import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMessageContent, IsUserId, IsLimit, IsMessageId } from '@/validation/schemas/common';
import { IsOptional } from 'class-validator';

export class UserEditMessageRequestDTO {
    @ApiProperty()
    @IsMessageContent()
    content!: string;
}

export class GetMessagesQueryDTO {
    @ApiProperty()
    @IsUserId()
    userId!: string;

    @ApiPropertyOptional()
    @IsLimit()
    limit: number = 50;

    @ApiPropertyOptional()
    @IsOptional()
    @IsMessageId()
    before?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsMessageId()
    around?: string;
}

export class MessageIdParamDTO {
    @ApiProperty()
    @IsMessageId()
    id!: string;
}

export class UserMessageParamsDTO {
    @ApiProperty()
    @IsUserId()
    userId!: string;

    @ApiProperty()
    @IsMessageId()
    messageId!: string;
}
