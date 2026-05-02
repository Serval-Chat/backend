import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString } from 'class-validator';
import { ServerBannerDTO } from './server.request.dto';

export class ServerStatsResponseDTO {
    @ApiProperty()
    public onlineCount!: number;

    @ApiProperty()
    public totalCount!: number;

    @ApiProperty()
    public bannedUserCount!: number;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    public serverId!: string;

    @ApiProperty()
    public serverName!: string;

    @ApiProperty()
    public ownerName!: string;

    @ApiProperty()
    public createdAt!: string;

    @ApiProperty()
    public allTimeHigh!: number;

    @ApiProperty()
    public newestMember!: string;

    @ApiProperty()
    public channelCount!: number;

    @ApiProperty()
    public emojiCount!: number;
}

export class ServerResponseDTO {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsMongoId()
    @IsString()
    public _id?: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    public ownerId!: string;

    @ApiProperty({ required: false })
    public icon?: string;

    @ApiProperty({ required: false, type: ServerBannerDTO })
    public banner?: ServerBannerDTO;

    @ApiProperty({ required: false })
    public description?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsMongoId()
    @IsString()
    public defaultRoleId?: string;

    @ApiProperty({ required: false })
    public memberCount?: number;

    @ApiProperty({ required: false })
    public allTimeHigh?: number;

    @ApiProperty({ required: false })
    public disableCustomFonts?: boolean;

    @ApiProperty({ required: false })
    public disableUsernameGlowAndCustomColor?: boolean;

    @ApiProperty({ required: false })
    public createdAt?: Date;

    @ApiProperty({ required: false })
    public updatedAt?: Date;

    @ApiProperty({ required: false })
    public canManage?: boolean;
}

export class SetDefaultRoleResponseDTO {
    @ApiProperty({ nullable: true, type: String })
    @IsOptional()
    @IsMongoId()
    @IsString()
    public defaultRoleId!: string | null;
}

export class UploadIconResponseDTO {
    @ApiProperty()
    public icon!: string;
}

export class UploadBannerResponseDTO {
    @ApiProperty()
    public banner!: string;
}
