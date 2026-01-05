import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import mongoose from 'mongoose';

export class InviteServerBannerDTO {
    @ApiProperty({ enum: ['image', 'gradient', 'color', 'gif'] })
    type!: 'image' | 'gradient' | 'color' | 'gif';

    @ApiProperty()
    value!: string;
}

export class InviteServerDTO {
    @ApiProperty()
    id!: string | mongoose.Types.ObjectId;

    @ApiProperty()
    name!: string;

    @ApiPropertyOptional()
    icon?: string;

    @ApiPropertyOptional({ type: InviteServerBannerDTO })
    banner?: InviteServerBannerDTO;
}

export class InviteDetailsResponseDTO {
    @ApiProperty()
    code!: string;

    @ApiPropertyOptional()
    expiresAt?: Date;

    @ApiPropertyOptional()
    maxUses?: number;

    @ApiProperty()
    uses!: number;

    @ApiProperty({ type: InviteServerDTO })
    server!: InviteServerDTO;

    @ApiProperty()
    memberCount!: number;
}
