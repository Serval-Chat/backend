import { ApiProperty } from '@nestjs/swagger';
import { IsMessageContent } from '@/validation/schemas/common';

export class UserEditMessageRequestDTO {
    @ApiProperty()
    @IsMessageContent()
    content!: string;
}
