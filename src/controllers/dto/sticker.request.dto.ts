import { IsNotEmpty, IsString, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
    STICKER_NAME_MAX_LENGTH,
    STICKER_NAME_REGEX,
} from '@/constants/stickers';

export class UploadStickerRequestDTO {
    @ApiProperty({
        description: 'The name of the sticker',
        maxLength: STICKER_NAME_MAX_LENGTH,
    })
    @IsNotEmpty()
    @IsString()
    @MaxLength(STICKER_NAME_MAX_LENGTH)
    @Matches(STICKER_NAME_REGEX, {
        message: 'Sticker name contains invalid characters',
    })
    public name!: string;
}
