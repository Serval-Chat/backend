import { IsNotEmpty, IsString, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadEmojiRequestDTO {
    @ApiProperty({
        description: 'The name of the emoji',
        maxLength: 32,
    })
    @IsNotEmpty()
    @IsString()
    @MaxLength(32)
    @Matches(/^[a-zA-Z0-9_-]+$/, {
        message: 'Emoji name contains invalid characters',
    })
    public name!: string;
}
