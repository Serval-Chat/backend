import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdminPermissions } from './common';

export class AdminUserListItemDTO {
    @ApiProperty()
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
    _id!: string;
    @ApiProperty()
    name!: string;
    @ApiProperty({ nullable: true })
    icon!: string | null;
    @ApiProperty()
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

