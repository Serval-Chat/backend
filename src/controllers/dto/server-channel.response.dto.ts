import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString } from 'class-validator';
import type { Permissions } from '@/permissions/types';

export class ChannelPermissionsMapDTO {
    [roleOrUserId: string]: Permissions;
}

export class PermissionsMapDTO {
    [permission: string]: boolean;
}

export class RolePermissionsMapDTO {
    [roleOrUserId: string]: PermissionsMapDTO;
}

export class ChannelResponseDTO {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsMongoId()
    @IsString()
    public id?: string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    public serverId!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty({ enum: ['text', 'voice', 'link'] })
    public type!: 'text' | 'voice' | 'link';

    @ApiProperty({ required: false })
    public description?: string;

    @ApiProperty({ required: false })
    public icon?: string;

    @ApiProperty({ required: false })
    public emoji?: string;

    @ApiProperty({ required: false, enum: ['custom', 'unicode'] })
    public emojiType?: 'custom' | 'unicode';

    @ApiProperty()
    public position!: number;

    @ApiProperty({ required: false, nullable: true, type: String })
    @IsOptional()
    @IsMongoId()
    @IsString()
    public categoryId?: string | null;

    @ApiProperty({ required: false })
    public lastMessageAt?: Date;

    @ApiProperty({ required: false, type: () => ChannelPermissionsMapDTO })
    public permissions?: ChannelPermissionsMapDTO;

    @ApiProperty({ required: false })
    public createdAt?: Date;

    @ApiProperty({ required: false })
    public updatedAt?: Date;

    @ApiProperty({ required: false })
    public slowMode?: number;

    @ApiProperty({ required: false, nullable: true, type: String })
    public slowModeNextMessageAllowedAt?: string | null;
}

export class ChannelWithReadResponseDTO extends ChannelResponseDTO {
    @ApiProperty({ required: false, nullable: true, type: String })
    // @ts-expect-error - Override generic type to string | null for JSON response
    declare public lastMessageAt?: string | null;

    @ApiProperty({ required: false, nullable: true, type: String })
    public lastReadAt!: string | null;
}

export class ChannelStatsResponseDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public channelId!: string;

    @ApiProperty()
    public channelName!: string;

    @ApiProperty()
    public createdAt!: string;

    @ApiProperty()
    public messageCount!: number;
}

export class CategoryResponseDTO {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsMongoId()
    @IsString()
    public id?: string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    public serverId!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty()
    public position!: number;

    @ApiProperty({ required: false, type: () => ChannelPermissionsMapDTO })
    public permissions?: ChannelPermissionsMapDTO;

    @ApiProperty({ required: false })
    public createdAt?: Date;

    @ApiProperty({ required: false })
    public updatedAt?: Date;
}

export class MessageResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class ReorderResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class PermissionsResponseDTO {
    @ApiProperty({
        type: () => RolePermissionsMapDTO,
        additionalProperties: true,
    })
    public permissions!: RolePermissionsMapDTO;
}

export class VoiceTokenResponseDTO {
    @ApiProperty()
    public token!: string;

    @ApiProperty()
    public serverUrl!: string;

    @ApiProperty()
    public roomName!: string;
}
