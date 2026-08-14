import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsObject,
    IsOptional,
    IsInt,
    IsPositive,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AdminPermissions, ProfileFieldDTO } from './common.request.dto';
import { IsReason, IsMessageContent } from '@/validation/schemas/common';

export class AdminResetProfileRequestDTO {
    @ApiProperty({ enum: ProfileFieldDTO, isArray: true })
    @IsArray()
    @IsEnum(ProfileFieldDTO, { each: true })
    public fields!: ProfileFieldDTO[];
}

export class AdminSoftDeleteUserRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsReason()
    public reason?: string;
}

export class AdminPermissionsDTO implements AdminPermissions {
    [key: string]: boolean;

    @ApiProperty()
    @IsBoolean()
    public adminAccess!: boolean;

    @ApiProperty()
    @IsBoolean()
    public viewUsers!: boolean;

    @ApiProperty()
    @IsBoolean()
    public manageUsers!: boolean;

    @ApiProperty()
    @IsBoolean()
    public manageBadges!: boolean;

    @ApiProperty()
    @IsBoolean()
    public banUsers!: boolean;

    @ApiProperty()
    @IsBoolean()
    public viewBans!: boolean;

    @ApiProperty()
    @IsBoolean()
    public warnUsers!: boolean;

    @ApiProperty()
    @IsBoolean()
    public viewLogs!: boolean;

    @ApiProperty()
    @IsBoolean()
    public manageServer!: boolean;

    @ApiProperty()
    @IsBoolean()
    public manageInvites!: boolean;

    @ApiProperty()
    @IsBoolean()
    public manageBots!: boolean;
}

export class AdminUpdateUserPermissionsRequestDTO {
    @ApiProperty({ type: AdminPermissionsDTO })
    @IsObject()
    @ValidateNested()
    @Type(() => AdminPermissionsDTO)
    public permissions!: AdminPermissionsDTO;
}

export class AdminBanUserRequestDTO {
    @ApiProperty()
    @IsReason()
    public reason!: string;

    @ApiProperty()
    @IsInt()
    @IsPositive()
    public duration!: number; // in minutes
}

export class AdminWarnUserRequestDTO {
    @ApiProperty()
    @IsMessageContent()
    public message!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @IsPositive()
    public duration?: number; // minutes after acknowledgment until the warning record expires; omitted means it never expires
}

export class AdminMuteUserRequestDTO {
    @ApiProperty()
    @IsReason()
    public reason!: string;

    @ApiProperty()
    @IsInt()
    @IsPositive()
    public duration!: number; // in minutes
}
