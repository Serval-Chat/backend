import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import {
    IsLimit,
    IsOffset,
    IsBooleanQuery,
} from '@/validation/schemas/common';
import { AdminUserFilterDTO } from './common.request.dto';

export class AdminListUsersRequestDTO {
    @ApiPropertyOptional()
    @IsLimit()
    limit?: number;

    @ApiPropertyOptional()
    @IsOffset()
    offset?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ enum: AdminUserFilterDTO })
    @IsOptional()
    @IsEnum(AdminUserFilterDTO)
    filter?: AdminUserFilterDTO;

    @ApiPropertyOptional()
    @IsBooleanQuery()
    includeDeleted?: boolean;
}