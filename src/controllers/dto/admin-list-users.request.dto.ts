import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { IsLimit, IsOffset, IsBooleanQuery } from '@/validation/schemas/common';
import { AdminUserFilterDTO } from './common.request.dto';

export class AdminListUsersRequestDTO {
    @ApiPropertyOptional()
    @IsLimit()
    public limit?: number;

    @ApiPropertyOptional()
    @IsOffset()
    public offset?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public search?: string;

    @ApiPropertyOptional({ enum: AdminUserFilterDTO })
    @IsOptional()
    @IsEnum(AdminUserFilterDTO)
    public filter?: AdminUserFilterDTO;

    @ApiPropertyOptional()
    @IsBooleanQuery()
    public includeDeleted?: boolean;
}
