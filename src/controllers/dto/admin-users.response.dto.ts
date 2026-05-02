import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsString } from 'class-validator';
import { AdminPermissions } from './common.request.dto';

export class AdminUserListItemDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public _id!: string;
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
}

export class AdminUserServerInfoDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public _id!: string;
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
    public _id!: string;
    @ApiProperty()
    public username!: string;
    @ApiProperty({ nullable: true })
    public displayName!: string | null;
}
