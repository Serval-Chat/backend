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
    public id!: string;
}

export class UserConnectionResponseDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty({ enum: ['Website'] })
    public type!: 'Website';

    @ApiProperty()
    public value!: string;

    @ApiPropertyOptional({ enum: ['pending', 'verified'] })
    public status?: 'pending' | 'verified';

    @ApiPropertyOptional()
    public recordType?: 'TXT' | 'HTTPS';

    @ApiPropertyOptional()
    public recordName?: string;

    @ApiPropertyOptional()
    public recordValue?: string;

    @ApiPropertyOptional()
    public filePath?: string;

    @ApiPropertyOptional()
    public fileUrl?: string;

    @ApiPropertyOptional()
    public fileContent?: string;

    @ApiPropertyOptional()
    public expiresAt?: Date;
}

export class ActiveMuteResponseDTO {
    @ApiProperty()
    public reason!: string;

    @ApiPropertyOptional({ nullable: true })
    public expirationTimestamp?: Date | null;
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

    @ApiPropertyOptional({ nullable: true })
    public bannerColor?: string | null;

    @ApiPropertyOptional({ nullable: true })
    public profilePrimaryColor?: string | null;

    @ApiPropertyOptional({ nullable: true })
    public profileAccentColor?: string | null;

    @ApiPropertyOptional()
    public serverSettings?: {
        order: (
            | string
            | { id: string; name: string; color: string; serverIds: string[] }
        )[];
    };

    @ApiPropertyOptional({ type: UserSettingsDTO })
    public settings?: UserSettingsDTO;

    @ApiPropertyOptional({ type: [UserConnectionResponseDTO] })
    public connections?: UserConnectionResponseDTO[];

    @ApiPropertyOptional({ type: ActiveMuteResponseDTO, nullable: true })
    public activeMute?: ActiveMuteResponseDTO | null;

    @ApiPropertyOptional({ nullable: true })
    public decorationId?: string | null;
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

export class UpdateAppearanceResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiPropertyOptional({ nullable: true })
    public profilePrimaryColor?: string | null;

    @ApiPropertyOptional({ nullable: true })
    public profileAccentColor?: string | null;
}

export class CreateWebsiteConnectionResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty()
    public connectionId!: string;

    @ApiProperty()
    public recordType!: 'TXT';

    @ApiProperty()
    public recordName!: string;

    @ApiProperty()
    public recordValue!: string;

    @ApiProperty()
    public filePath!: string;

    @ApiProperty()
    public fileUrl!: string;

    @ApiProperty()
    public fileContent!: string;

    @ApiProperty()
    public expiresAt!: Date;
}
