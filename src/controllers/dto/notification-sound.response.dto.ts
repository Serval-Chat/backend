import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsOptional,
    IsBoolean,
    IsString,
    IsNumber,
    Min,
    Max,
} from 'class-validator';

export class NotificationSoundResponseDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty()
    public url!: string;

    @ApiProperty()
    public enabled!: boolean;

    @ApiProperty()
    public volume!: number;

    @ApiProperty()
    public normalizationGain!: number;
}

export class NotificationSoundDeletedResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class PatchNotificationSoundRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public enabled?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1)
    public volume?: number;
}
