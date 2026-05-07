import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsString } from 'class-validator';
import { SerializedCustomStatus } from '@/utils/status';
import { AdminPermissions } from '@/permissions/AdminPermissions';
import { VALID_USERNAME_FONTS } from '@/validation/schemas/profile';
import { UsernameGradientDTO, UsernameGlowDTO } from './profile.request.dto';
import { UserSettingsDTO } from './types.dto';

export class BadgeResponseDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public _id!: string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    public id!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty()
    public description!: string;

    @ApiProperty()
    public icon!: string;

    @ApiProperty()
    public color!: string;

    @ApiProperty()
    public createdAt!: Date;
}

export class UserLookupResponseDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public _id!: string;
}

export class UserProfileResponseDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public id!: string;

    @ApiProperty()
    public username!: string;

    @ApiProperty({ nullable: true })
    public displayName!: string | null;

    @ApiProperty({ nullable: true })
    public profilePicture!: string | null;

    @ApiPropertyOptional({ enum: VALID_USERNAME_FONTS })
    public usernameFont?: string;

    @ApiPropertyOptional({ type: UsernameGradientDTO })
    public usernameGradient?: UsernameGradientDTO;

    @ApiPropertyOptional({ type: UsernameGlowDTO })
    public usernameGlow?: UsernameGlowDTO;

    @ApiProperty({ nullable: true })
    public customStatus!: SerializedCustomStatus | null;

    @ApiPropertyOptional()
    public permissions?: AdminPermissions;

    @ApiProperty()
    public createdAt!: Date;

    @ApiPropertyOptional()
    public bio?: string;

    @ApiPropertyOptional()
    public pronouns?: string;

    @ApiProperty({ type: [BadgeResponseDTO] })
    public badges!: BadgeResponseDTO[];

    @ApiProperty({ nullable: true })
    public banner!: string | null;

    @ApiPropertyOptional()
    public serverSettings?: {
        order: (
            | string
            | { id: string; name: string; color: string; serverIds: string[] }
        )[];
    };

    @ApiPropertyOptional({ type: UserSettingsDTO })
    public settings?: UserSettingsDTO;
}

export class UpdateProfilePictureResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty()
    public profilePicture!: string;
}

export class UpdateBannerResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty()
    public banner!: string;
}

export class BadgeOperationResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty({ type: [BadgeResponseDTO] })
    public badges!: BadgeResponseDTO[];
}
