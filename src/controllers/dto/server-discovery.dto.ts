import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    IsArray,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

class DiscoveryServerBannerDTO {
    @ApiProperty({ enum: ['color', 'image', 'gif'] })
    public type!: 'color' | 'image' | 'gif';

    @ApiProperty()
    public value!: string;
}

export class ListDiscoveryServersQueryDTO {
    @ApiPropertyOptional({ maxLength: 100 })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    public q?: string;

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @Transform(({ value }) => {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
            return value
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean);
        }
        return undefined;
    })
    @IsArray()
    @ArrayMaxSize(8)
    @IsString({ each: true })
    @MaxLength(25, { each: true })
    public tags?: string[];

    @ApiPropertyOptional({ minimum: 1, maximum: 50 })
    @IsOptional()
    @Transform(({ value }) => Number(value))
    @IsInt()
    @Min(1)
    @Max(50)
    public limit?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(300)
    public cursor?: string;
}

export class DiscoveryTagFacetDTO {
    @ApiProperty()
    public tag!: string;

    @ApiProperty()
    public count!: number;
}

export class DiscoveryServerDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty()
    public description!: string;

    @ApiPropertyOptional()
    public icon?: string;

    @ApiPropertyOptional({ type: DiscoveryServerBannerDTO })
    public banner?: DiscoveryServerBannerDTO;

    @ApiProperty()
    public verified!: boolean;

    @ApiProperty({ type: [String] })
    public tags!: string[];

    @ApiProperty()
    public memberCount!: number;

    @ApiProperty()
    public inviteCode!: string;
}

export class DiscoveryServersResponseDTO {
    @ApiProperty({ type: [DiscoveryServerDTO] })
    public items!: DiscoveryServerDTO[];

    @ApiProperty({ type: [DiscoveryTagFacetDTO] })
    public tagFacets!: DiscoveryTagFacetDTO[];

    @ApiPropertyOptional()
    public nextCursor?: string;
}

export class ServerDiscoveryStatusDTO {
    @ApiProperty()
    public eligible!: boolean;

    @ApiProperty({ type: [String] })
    public blockers!: string[];

    @ApiProperty()
    public hasValidVanityInvite!: boolean;

    @ApiPropertyOptional()
    public vanityInviteCode?: string;
}
