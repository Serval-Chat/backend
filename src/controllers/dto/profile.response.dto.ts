import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsString } from 'class-validator';
import { SerializedCustomStatus } from '@/utils/status';
import { AdminPermissions } from '@/routes/api/v1/admin/permissions';
import { VALID_USERNAME_FONTS } from '@/validation/schemas/profile';
import { UsernameGradientDTO, UsernameGlowDTO } from './profile.request.dto';

export class BadgeResponseDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    _id!: string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    id!: string;

    @ApiProperty()
    name!: string;

    @ApiProperty()
    description!: string;

    @ApiProperty()
    icon!: string;

    @ApiProperty()
    color!: string;

    @ApiProperty()
    createdAt!: Date;
}

export class UserLookupResponseDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    _id!: string;
}

export class UserProfileResponseDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    id!: string;

    @ApiProperty()
    username!: string;

    @ApiProperty({ nullable: true })
    displayName!: string | null;

    @ApiProperty({ nullable: true })
    profilePicture!: string | null;

    @ApiPropertyOptional({ enum: VALID_USERNAME_FONTS })
    usernameFont?: string;

    @ApiPropertyOptional({ type: UsernameGradientDTO })
    usernameGradient?: UsernameGradientDTO;

    @ApiPropertyOptional({ type: UsernameGlowDTO })
    usernameGlow?: UsernameGlowDTO;

    @ApiProperty({ nullable: true })
    customStatus!: SerializedCustomStatus | null;

    @ApiPropertyOptional()
    permissions?: AdminPermissions;

    @ApiProperty()
    createdAt!: Date;

    @ApiPropertyOptional()
    bio?: string;

    @ApiPropertyOptional()
    pronouns?: string;

    @ApiProperty({ type: [BadgeResponseDTO] })
    badges!: BadgeResponseDTO[];

    @ApiProperty({ nullable: true })
    banner!: string | null;

    @ApiPropertyOptional()
    serverSettings?: {
        order: (string | { id: string; name: string; color: string; serverIds: string[] })[];
    };

    @ApiPropertyOptional()
    settings?: Record<string, unknown>;
}

export class UpdateProfilePictureResponseDTO {
    @ApiProperty()
    message!: string;

    @ApiProperty()
    profilePicture!: string;
}

export class UpdateBannerResponseDTO {
    @ApiProperty()
    message!: string;

    @ApiProperty()
    banner!: string;
}

export class BadgeOperationResponseDTO {
    @ApiProperty()
    message!: string;

    @ApiProperty({ type: [BadgeResponseDTO] })
    badges!: BadgeResponseDTO[];
}
