import { ApiProperty } from '@nestjs/swagger';

export class SendFriendRequestDTO {
    @ApiProperty()
    username!: string;
}
