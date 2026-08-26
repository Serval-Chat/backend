import { ApiProperty } from '@nestjs/swagger';
import { IsUserId } from '@/validation/schemas/common';

export class CreateDmChannelRequestDTO {
    @ApiProperty()
    @IsUserId()
    public recipientId!: string;
}
