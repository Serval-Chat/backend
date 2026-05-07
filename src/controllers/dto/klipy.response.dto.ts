import { ApiProperty } from '@nestjs/swagger';

export class GifMetadataResponseDTO {
    @ApiProperty({ description: 'Klipy GIF identifier' })
    public klipyId!: string;

    @ApiProperty({ description: 'Full-resolution GIF URL' })
    public url!: string;

    @ApiProperty({ description: 'Small / preview GIF URL' })
    public previewUrl!: string;

    @ApiProperty({ description: 'GIF width in pixels' })
    public width!: number;

    @ApiProperty({ description: 'GIF height in pixels' })
    public height!: number;

    @ApiProperty({
        description: 'Content type (gif or sticker)',
        enum: ['gif', 'sticker'],
    })
    public contentType!: 'gif' | 'sticker';

    @ApiProperty({ description: 'Cache expiry timestamp' })
    public expiresAt!: Date;
}

export class FavoriteGifResponseDTO {
    @ApiProperty({ description: 'Klipy GIF identifier' })
    public klipyId!: string;

    @ApiProperty({ description: 'Full-resolution GIF URL' })
    public url!: string;

    @ApiProperty({ description: 'Small / preview GIF URL' })
    public previewUrl!: string;

    @ApiProperty({ description: 'GIF width in pixels' })
    public width!: number;

    @ApiProperty({ description: 'GIF height in pixels' })
    public height!: number;

    @ApiProperty({
        description: 'Content type (gif or sticker)',
        enum: ['gif', 'sticker'],
    })
    public contentType!: 'gif' | 'sticker';
}

export class ToggleFavoriteResponseDTO {
    @ApiProperty({ description: 'Whether the GIF is now favorited' })
    public favorited!: boolean;
}
