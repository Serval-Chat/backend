import { ApiProperty } from '@nestjs/swagger';

export class CreateServerRequest {
    @ApiProperty()
    name!: string;
}

export class ServerBanner {
    @ApiProperty()
    type!: string;

    @ApiProperty()
    value!: string;
}

export class UpdateServerRequest {
    @ApiProperty({ required: false })
    name?: string;

    @ApiProperty({ required: false, type: ServerBanner })
    banner?: ServerBanner;

    @ApiProperty({ required: false })
    disableCustomFonts?: boolean;
}

export class SetDefaultRoleRequest {
    @ApiProperty({ nullable: true, type: String })
    roleId!: string | null;
}

export class ServerStatsResponse {
    @ApiProperty()
    onlineCount!: number;

    @ApiProperty()
    totalCount!: number;

    @ApiProperty()
    bannedUserCount!: number;

    @ApiProperty()
    serverId!: string;

    @ApiProperty()
    serverName!: string;

    @ApiProperty()
    ownerName!: string;

    @ApiProperty()
    createdAt!: string;

    @ApiProperty()
    allTimeHigh!: number;

    @ApiProperty()
    newestMember!: string;

    @ApiProperty()
    channelCount!: number;

    @ApiProperty()
    emojiCount!: number;
}

export class ServerResponse {
    @ApiProperty({ required: false })
    _id?: string;

    @ApiProperty()
    name!: string;

    @ApiProperty()
    ownerId!: string;

    @ApiProperty({ required: false })
    icon?: string;

    @ApiProperty({ required: false, type: ServerBanner })
    banner?: ServerBanner;

    @ApiProperty({ required: false })
    description?: string;

    @ApiProperty({ required: false })
    defaultRoleId?: string;

    @ApiProperty({ required: false })
    memberCount?: number;

    @ApiProperty({ required: false })
    allTimeHigh?: number;

    @ApiProperty({ required: false })
    disableCustomFonts?: boolean;

    @ApiProperty({ required: false })
    createdAt?: Date;

    @ApiProperty({ required: false })
    updatedAt?: Date;
}

export class SetDefaultRoleResponse {
    @ApiProperty({ nullable: true, type: String })
    defaultRoleId!: string | null;
}

export class UploadIconResponse {
    @ApiProperty()
    icon!: string;
}

export class UploadBannerResponse {
    @ApiProperty()
    banner!: string;
}
