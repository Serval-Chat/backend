import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsOptional,
    IsBoolean,
    ValidateNested,
    IsEnum,
    ValidateIf,
    MinLength,
    IsMongoId,
    IsArray,
    ArrayMaxSize,
    MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsName, IsRoleId, IsColor } from '@/validation/schemas/common';
import { ServerBannerTypeDTO } from './common.request.dto';

export class ServerBannerDTO {
    @ApiProperty({ enum: ServerBannerTypeDTO })
    @IsEnum(ServerBannerTypeDTO)
    public type!: ServerBannerTypeDTO;

    @ApiProperty()
    @ValidateIf((o) => o.type === ServerBannerTypeDTO.COLOR)
    @IsColor()
    @IsString()
    public value!: string;
}

export class CreateServerRequestDTO {
    @ApiProperty()
    @IsName()
    @MinLength(2, { message: 'Name must be at least 2 characters' })
    public name!: string;
}

export class UpdateServerRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsName()
    public name?: string;

    @ApiPropertyOptional({ type: ServerBannerDTO })
    @IsOptional()
    @ValidateNested()
    @Type(() => ServerBannerDTO)
    public banner?: ServerBannerDTO;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public disableCustomFonts?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public disableUsernameGlowAndCustomColor?: boolean;

    @ApiPropertyOptional({ nullable: true, type: String })
    @IsOptional()
    @IsMongoId()
    @IsRoleId()
    public defaultRoleId?: string | null;

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(8)
    @IsString({ each: true })
    @MaxLength(25, { each: true })
    public tags?: string[];
}

export class SetDefaultRoleRequestDTO {
    @ApiProperty({ nullable: true, type: String })
    @IsOptional()
    @IsMongoId()
    @IsRoleId()
    public roleId!: string | null;
}
