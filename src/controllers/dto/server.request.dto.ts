import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsOptional,
    IsBoolean,
    ValidateNested,
    IsEnum,
    ValidateIf,
    MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsName, IsRoleId, IsColor } from '@/validation/schemas/common';
import { ServerBannerTypeDTO } from './common.request.dto';

export class ServerBannerDTO {
    @ApiProperty({ enum: ServerBannerTypeDTO })
    @IsEnum(ServerBannerTypeDTO)
    type!: ServerBannerTypeDTO;

    @ApiProperty()
    @ValidateIf((o) => o.type === ServerBannerTypeDTO.COLOR)
    @IsColor()
    @IsString()
    value!: string;
}

export class CreateServerRequestDTO {
    @ApiProperty()
    @IsName()
    @MinLength(2, { message: 'Name must be at least 2 characters' })
    name!: string;
}

export class UpdateServerRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsName()
    name?: string;

    @ApiPropertyOptional({ type: ServerBannerDTO })
    @IsOptional()
    @ValidateNested()
    @Type(() => ServerBannerDTO)
    banner?: ServerBannerDTO;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    disableCustomFonts?: boolean;
}

export class SetDefaultRoleRequestDTO {
    @ApiProperty({ nullable: true, type: String })
    @IsOptional()
    @IsRoleId()
    roleId!: string | null;
}
