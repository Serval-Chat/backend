import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsString } from 'class-validator';
import { SerializedCustomStatus } from '@/utils/status';
import { VALID_USERNAME_FONTS } from '@/validation/schemas/profile';
import { AdminPermissions } from './common.request.dto';
import { UsernameGradientDTO, UsernameGlowDTO } from './profile.request.dto';
import {
    PrivacySettingsDTO,
    UserConnectionResponseDTO,
} from './profile.response.dto';

export class AdminUserListItemDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public id!: string;
    @ApiProperty()
    public username!: string;
    @ApiProperty()
    public login!: string;
    @ApiProperty({ nullable: true })
    public displayName!: string | null;
    @ApiProperty({ nullable: true })
    public profilePicture!: string | null;
    @ApiProperty()
    public permissions!: string | AdminPermissions;
    @ApiProperty()
    public createdAt!: Date;
    @ApiPropertyOptional()
    public banExpiry?: Date;
    @ApiPropertyOptional()
    public muteExpiry?: Date;
    @ApiProperty()
    public muteActive!: boolean;
    @ApiPropertyOptional()
    public muteReason?: string;
    @ApiProperty()
    public warningCount!: number;
    @ApiProperty({ type: [String] })
    public badges!: string[];
}

export class AdminUserDetailsDTO extends AdminUserListItemDTO {
    @ApiProperty()
    public bio!: string;
    @ApiProperty()
    public pronouns!: string;
    @ApiProperty({ nullable: true })
    public banner!: string | null;
    @ApiPropertyOptional()
    public deletedAt?: Date;
    @ApiPropertyOptional()
    public deletedReason?: string;
    @ApiPropertyOptional({ nullable: true })
    public decorationId?: string | null;
    @ApiPropertyOptional({ nullable: true })
    public bannerColor?: string | null;
    @ApiPropertyOptional({ nullable: true })
    public profilePrimaryColor?: string | null;
    @ApiPropertyOptional({ nullable: true })
    public profileAccentColor?: string | null;
    @ApiPropertyOptional({ enum: VALID_USERNAME_FONTS })
    public usernameFont?: string;
    @ApiPropertyOptional({ type: () => UsernameGradientDTO })
    public usernameGradient?: UsernameGradientDTO;
    @ApiPropertyOptional({ type: () => UsernameGlowDTO })
    public usernameGlow?: UsernameGlowDTO;
    @ApiPropertyOptional({ nullable: true })
    public customStatus?: SerializedCustomStatus | null;
    @ApiPropertyOptional({ type: [UserConnectionResponseDTO] })
    public connections?: UserConnectionResponseDTO[];
    @ApiPropertyOptional({ default: false })
    public isPrivate?: boolean;
    @ApiPropertyOptional({ type: () => PrivacySettingsDTO })
    public privacySettings?: PrivacySettingsDTO;
}

export class AdminUserServerInfoDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public id!: string;
    @ApiProperty()
    public name!: string;
    @ApiProperty({ nullable: true })
    public icon!: string | null;
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public ownerId!: string;
    @ApiPropertyOptional()
    public joinedAt?: Date;
    @ApiProperty()
    public isOwner!: boolean;
    @ApiProperty()
    public memberCount!: number;
}

export class AdminExtendedUserDetailsDTO extends AdminUserDetailsDTO {
    @ApiProperty({ type: [AdminUserServerInfoDTO] })
    public servers!: AdminUserServerInfoDTO[];
}

export class AdminUserShortDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public id!: string;
    @ApiProperty()
    public username!: string;
    @ApiProperty({ nullable: true })
    public displayName!: string | null;
}
