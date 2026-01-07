import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsEnum,
    IsOptional,
    IsObject,
    IsInt,
    IsPositive,
} from 'class-validator';
import { AdminPermissions, ProfileFieldDTO } from './common.request.dto';
import { IsReason, IsMessageContent } from '@/validation/schemas/common';

export class AdminResetProfileRequestDTO {
    @ApiProperty({ enum: ProfileFieldDTO, isArray: true })
    @IsArray()
    @IsEnum(ProfileFieldDTO, { each: true })
    fields!: ProfileFieldDTO[];
}

export class AdminSoftDeleteUserRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsReason()
    reason?: string;
}

export class AdminUpdateUserPermissionsRequestDTO {
    @ApiProperty()
    @IsObject()
    permissions!: AdminPermissions;
}

export class AdminBanUserRequestDTO {
    @ApiProperty()
    @IsReason()
    reason!: string;

    @ApiProperty()
    @IsInt()
    @IsPositive()
    duration!: number; // in minutes
}

export class AdminWarnUserRequestDTO {
    @ApiProperty()
    @IsMessageContent()
    message!: string;
}
