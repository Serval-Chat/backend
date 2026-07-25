import { BADGE_ICONS, BadgeIcon } from '@/models/Badge';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsHexColor,
    IsIn,
} from 'class-validator';

export class CreateBadgeRequestDTO {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    public id!: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    public name!: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    public description!: string;

    @ApiProperty({ enum: BADGE_ICONS })
    @IsString()
    @IsNotEmpty()
    @IsIn(BADGE_ICONS)
    public icon!: BadgeIcon;

    @ApiPropertyOptional()
    @IsOptional()
    @IsHexColor()
    public color?: string;
}

export class UpdateBadgeRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    public name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    public description?: string;

    @ApiPropertyOptional({ enum: BADGE_ICONS })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @IsIn(BADGE_ICONS)
    public icon?: BadgeIcon;

    @ApiPropertyOptional()
    @IsOptional()
    @IsHexColor()
    public color?: string;
}

export class BadgeResponseDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty()
    public description!: string;

    @ApiProperty({ enum: BADGE_ICONS })
    public icon!: BadgeIcon;

    @ApiProperty()
    public color!: string;

    @ApiProperty()
    public createdAt!: Date;
}

export class AdminSimpleMessageResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class BadgeUserActionResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty({ type: [String] })
    public badges!: string[];
}
