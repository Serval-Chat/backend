import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsInt,
    Min,
    Max,
    IsOptional,
    IsMongoId,
} from 'class-validator';

export class CreateBlockProfileRequestDTO {
    @ApiProperty({
        description: 'Name of the block profile',
        example: 'Mute and hide',
    })
    @IsString()
    public name!: string;

    @ApiProperty({
        description: '15-bit bitmask of flags',
        example: 1024,
        minimum: 0,
        maximum: 32767,
    })
    @IsInt()
    @Min(0)
    @Max(32767)
    public flags!: number;
}

export class UpdateBlockProfileRequestDTO {
    @ApiPropertyOptional({
        description: 'New name of the block profile',
        example: 'Strict Block',
    })
    @IsOptional()
    @IsString()
    public name?: string;

    @ApiPropertyOptional({
        description: 'New 15-bit bitmask of flags',
        example: 32767,
        minimum: 0,
        maximum: 32767,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(32767)
    public flags?: number;
}

export class UpsertBlockRelationshipRequestDTO {
    @ApiProperty({
        description: 'ID of the block profile to apply',
        example: '60d0fe4f5311236168a109ca',
    })
    @IsMongoId()
    public profileId!: string;
}
