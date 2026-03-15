import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, IsInt, Min } from 'class-validator';

export class ToggleFavoriteGifRequestDTO {
    @ApiProperty({ description: 'Klipy GIF identifier' })
    @IsString()
    klipyId!: string;

    @ApiProperty({ description: 'Full-resolution GIF URL' })
    @IsUrl()
    url!: string;

    @ApiProperty({ description: 'Small / preview GIF URL' })
    @IsUrl()
    previewUrl!: string;

    @ApiProperty({ description: 'GIF width in pixels' })
    @IsInt()
    @Min(0)
    width!: number;

    @ApiProperty({ description: 'GIF height in pixels' })
    @IsInt()
    @Min(0)
    height!: number;
}
