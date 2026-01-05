import { ApiProperty } from '@nestjs/swagger';
import { ServerBannerDTO } from './server.request.dto';

export class ServerStatsResponseDTO {
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

export class ServerResponseDTO {
    @ApiProperty({ required: false })
    _id?: string;

    @ApiProperty()
    name!: string;

    @ApiProperty()
    ownerId!: string;

    @ApiProperty({ required: false })
    icon?: string;

    @ApiProperty({ required: false, type: ServerBannerDTO })
    banner?: ServerBannerDTO;

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

export class SetDefaultRoleResponseDTO {
    @ApiProperty({ nullable: true, type: String })
    defaultRoleId!: string | null;
}

export class UploadIconResponseDTO {
    @ApiProperty()
    icon!: string;
}

export class UploadBannerResponseDTO {
    @ApiProperty()
    banner!: string;
}
