import { ApiProperty } from '@nestjs/swagger';
import { IsUsername } from '@/validation/schemas/common';

export class SendFriendRequestDTO {
    @ApiProperty()
    @IsUsername()
    public username!: string;
}
