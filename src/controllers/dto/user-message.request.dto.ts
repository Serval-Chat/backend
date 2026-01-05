import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class UserEditMessageRequestDTO {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    content!: string;
}
