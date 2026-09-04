import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsUrl,
    IsInt,
    Min,
    IsEnum,
    IsOptional,
    MaxLength,
} from 'class-validator';
import {
    MAX_GIF_KLIPY_ID_LENGTH,
    MAX_GIF_SLUG_LENGTH,
    MAX_GIF_URL_LENGTH,
} from '@/constants/favoriteGifs';

export class ToggleFavoriteGifRequestDTO {
    @ApiProperty({ description: 'Klipy GIF identifier' })
    @IsString()
    @MaxLength(MAX_GIF_KLIPY_ID_LENGTH)
    public klipyId!: string;

    @ApiProperty({ description: 'Klipy GIF slug', required: false })
    @IsString()
    @MaxLength(MAX_GIF_SLUG_LENGTH)
    @IsOptional()
    public slug?: string;

    @ApiProperty({ description: 'Full-resolution GIF URL' })
    @IsUrl()
    @MaxLength(MAX_GIF_URL_LENGTH)
    public url!: string;

    @ApiProperty({ description: 'Small / preview GIF URL' })
    @IsUrl()
    @MaxLength(MAX_GIF_URL_LENGTH)
    public previewUrl!: string;

    @ApiProperty({ description: 'GIF width in pixels' })
    @IsInt()
    @Min(0)
    public width!: number;

    @ApiProperty({ description: 'GIF height in pixels' })
    @IsInt()
    @Min(0)
    public height!: number;
    @ApiProperty({
        description: 'Content type (gif or sticker)',
        enum: ['gif', 'sticker'],
        required: false,
    })
    @IsEnum(['gif', 'sticker'])
    @IsOptional()
    public contentType?: 'gif' | 'sticker';
}
