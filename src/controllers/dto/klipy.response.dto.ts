import { ApiProperty } from '@nestjs/swagger';

export class GifMetadataResponseDTO {
    @ApiProperty({ description: 'Klipy GIF identifier' })
    klipyId!: string;

    @ApiProperty({ description: 'Full-resolution GIF URL' })
    url!: string;

    @ApiProperty({ description: 'Small / preview GIF URL' })
    previewUrl!: string;

    @ApiProperty({ description: 'GIF width in pixels' })
    width!: number;

    @ApiProperty({ description: 'GIF height in pixels' })
    height!: number;

    @ApiProperty({ description: 'Cache expiry timestamp' })
    expiresAt!: Date;
}

export class FavoriteGifResponseDTO {
    @ApiProperty({ description: 'Klipy GIF identifier' })
    klipyId!: string;

    @ApiProperty({ description: 'Full-resolution GIF URL' })
    url!: string;

    @ApiProperty({ description: 'Small / preview GIF URL' })
    previewUrl!: string;

    @ApiProperty({ description: 'GIF width in pixels' })
    width!: number;

    @ApiProperty({ description: 'GIF height in pixels' })
    height!: number;
}

export class ToggleFavoriteResponseDTO {
    @ApiProperty({ description: 'Whether the GIF is now favorited' })
    favorited!: boolean;
}
