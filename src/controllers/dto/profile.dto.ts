import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SerializedCustomStatus } from '@/utils/status';
import { Types } from 'mongoose';
import { AdminPermissions } from '@/routes/api/v1/admin/permissions';

export class UpdateStatusRequest {
    @ApiPropertyOptional()
    text?: string;

    @ApiPropertyOptional()
    emoji?: string;

    @ApiPropertyOptional()
    expiresAt?: string | null;

    @ApiPropertyOptional()
    expiresInMinutes?: number;

    @ApiPropertyOptional()
    clear?: boolean;
}

export class BulkStatusRequest {
    @ApiProperty()
    usernames!: string[];
}

export class UsernameGradientDTO {
    @ApiProperty()
    enabled!: boolean;

    @ApiProperty()
    colors!: string[];

    @ApiProperty()
    angle!: number;
}

export class UsernameGlowDTO {
    @ApiProperty()
    enabled!: boolean;

    @ApiProperty()
    color!: string;

    @ApiProperty()
    intensity!: number;
}

export class UpdateStyleRequest {
    @ApiPropertyOptional()
    usernameFont?: string;

    @ApiPropertyOptional({ type: UsernameGradientDTO })
    usernameGradient?: UsernameGradientDTO;

    @ApiPropertyOptional({ type: UsernameGlowDTO })
    usernameGlow?: UsernameGlowDTO;
}

export class UserLookupResponse {
    @ApiProperty()
    _id!: string;
}

export class ChangeUsernameRequest {
    @ApiProperty()
    newUsername!: string;
}

export class UpdateLanguageRequest {
    @ApiProperty()
    language!: string;
}

export class BadgeResponse {
    @ApiProperty({ type: String })
    _id!: Types.ObjectId | string;

    @ApiProperty()
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

export class UserProfile {
    @ApiProperty()
    id!: string;

    @ApiProperty()
    username!: string;

    @ApiProperty()
    login!: string;

    @ApiProperty({ nullable: true })
    displayName!: string | null;

    @ApiProperty({ nullable: true })
    profilePicture!: string | null;

    @ApiPropertyOptional()
    usernameFont?: string;

    @ApiPropertyOptional({ type: UsernameGradientDTO })
    usernameGradient?: UsernameGradientDTO;

    @ApiPropertyOptional({ type: UsernameGlowDTO })
    usernameGlow?: UsernameGlowDTO;

    @ApiProperty({ nullable: true })
    customStatus!: SerializedCustomStatus | null;

    @ApiProperty()
    permissions!: string | AdminPermissions;

    @ApiProperty()
    createdAt!: Date;

    @ApiPropertyOptional()
    bio?: string;

    @ApiPropertyOptional()
    pronouns?: string;

    @ApiProperty({ type: [BadgeResponse] })
    badges!: BadgeResponse[];

    @ApiProperty({ nullable: true })
    banner!: string | null;
}

export class BioUpdate {
    @ApiProperty()
    bio!: string;
}

export class PronounsUpdate {
    @ApiProperty()
    pronouns!: string;
}

export class DisplayNameUpdate {
    @ApiProperty()
    displayName!: string;
}

export class UpdateProfilePictureResponse {
    @ApiProperty()
    message!: string;

    @ApiProperty()
    profilePicture!: string;
}

export class UpdateBannerResponse {
    @ApiProperty()
    message!: string;

    @ApiProperty()
    banner!: string;
}

export class AssignBadgesRequest {
    @ApiProperty()
    badgeIds!: string[];
}

export class BadgeOperationResponse {
    @ApiProperty()
    message!: string;

    @ApiProperty({ type: [BadgeResponse] })
    badges!: BadgeResponse[];
}
