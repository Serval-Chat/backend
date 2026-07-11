import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { IsUsername } from '@/validation/schemas/common';

export class SendFriendRequestDTO {
    @ApiProperty()
    @IsUsername()
    public username!: string;
}

export class SetFriendNicknameDTO {
    @ApiProperty()
    @IsString()
    @MinLength(1)
    @MaxLength(32)
    public nickname!: string;
}
