import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsString } from 'class-validator';

export class InviteServerBannerDTO {
    @ApiProperty({ enum: ['image', 'gradient', 'color', 'gif'] })
    public type!: 'image' | 'gradient' | 'color' | 'gif';

    @ApiProperty()
    public value!: string;
}

export class InviteServerDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public id!: string;

    @ApiProperty()
    public name!: string;

    @ApiPropertyOptional()
    public icon?: string;

    @ApiPropertyOptional({ type: InviteServerBannerDTO })
    public banner?: InviteServerBannerDTO;

    @ApiPropertyOptional()
    public verified?: boolean;

    @ApiPropertyOptional({ type: [String] })
    public tags?: string[];
}

export class InviteDetailsResponseDTO {
    @ApiProperty()
    public code!: string;

    @ApiPropertyOptional()
    public expiresAt?: Date;

    @ApiPropertyOptional()
    public maxUses?: number;

    @ApiProperty()
    public uses!: number;

    @ApiProperty({ type: InviteServerDTO })
    public server!: InviteServerDTO;

    @ApiProperty()
    public memberCount!: number;
}
