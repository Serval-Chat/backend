import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsString } from 'class-validator';
import { AdminPermissions } from './common.request.dto';

export class AdminUserListItemDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    _id!: string;
    @ApiProperty()
    username!: string;
    @ApiProperty()
    login!: string;
    @ApiProperty({ nullable: true })
    displayName!: string | null;
    @ApiProperty({ nullable: true })
    profilePicture!: string | null;
    @ApiProperty()
    permissions!: string | AdminPermissions;
    @ApiProperty()
    createdAt!: Date;
    @ApiPropertyOptional()
    banExpiry?: Date;
    @ApiProperty()
    warningCount!: number;
    @ApiProperty({ type: [String] })
    badges!: string[];
}

export class AdminUserDetailsDTO extends AdminUserListItemDTO {
    @ApiProperty()
    bio!: string;
    @ApiProperty()
    pronouns!: string;
    @ApiProperty({ nullable: true })
    banner!: string | null;
    @ApiPropertyOptional()
    deletedAt?: Date;
    @ApiPropertyOptional()
    deletedReason?: string;
}

export class AdminUserServerInfoDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    _id!: string;
    @ApiProperty()
    name!: string;
    @ApiProperty({ nullable: true })
    icon!: string | null;
    @ApiProperty()
    @IsMongoId()
    @IsString()
    ownerId!: string;
    @ApiPropertyOptional()
    joinedAt?: Date;
    @ApiProperty()
    isOwner!: boolean;
    @ApiProperty()
    memberCount!: number;
}

export class AdminExtendedUserDetailsDTO extends AdminUserDetailsDTO {
    @ApiProperty({ type: [AdminUserServerInfoDTO] })
    servers!: AdminUserServerInfoDTO[];
}

export class AdminUserShortDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    _id!: string;
    @ApiProperty()
    username!: string;
    @ApiProperty({ nullable: true })
    displayName!: string | null;
}
