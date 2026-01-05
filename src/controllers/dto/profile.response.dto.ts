import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SerializedCustomStatus } from '@/utils/status';
import { Types } from 'mongoose';
import { AdminPermissions } from '@/routes/api/v1/admin/permissions';
import { UsernameGradientDTO, UsernameGlowDTO } from './profile.request.dto';

export class BadgeResponseDTO {
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

export class UserLookupResponseDTO {
    @ApiProperty()
    _id!: string;
}

export class UserProfileResponseDTO {
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

    @ApiProperty({ type: [BadgeResponseDTO] })
    badges!: BadgeResponseDTO[];

    @ApiProperty({ nullable: true })
    banner!: string | null;
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
