import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, IsInt, Min } from 'class-validator';

export class ToggleFavoriteGifRequestDTO {
    @ApiProperty({ description: 'Klipy GIF identifier' })
    @IsString()
    public klipyId!: string;

    @ApiProperty({ description: 'Full-resolution GIF URL' })
    @IsUrl()
    public url!: string;

    @ApiProperty({ description: 'Small / preview GIF URL' })
    @IsUrl()
    public previewUrl!: string;

    @ApiProperty({ description: 'GIF width in pixels' })
    @IsInt()
    @Min(0)
    public width!: number;

    @ApiProperty({ description: 'GIF height in pixels' })
    @IsInt()
    @Min(0)
    public height!: number;
}
