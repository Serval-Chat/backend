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
    public fields!: ProfileFieldDTO[];
}

export class AdminSoftDeleteUserRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsReason()
    public reason?: string;
}

export class AdminUpdateUserPermissionsRequestDTO {
    @ApiProperty()
    @IsObject()
    public permissions!: AdminPermissions;
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
}
