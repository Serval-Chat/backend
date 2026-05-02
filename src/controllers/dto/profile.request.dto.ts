import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsNumber,
    IsString,
    IsOptional,
    IsArray,
    ValidateNested,
    IsInt,
    IsPositive,
    Min,
    Max,
    MaxLength,
    MinLength,
    ArrayMaxSize,
    IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
    IsColor,
    IsIntensity,
    IsUsername,
    IsBio,
    IsIsoDate,
    IsEmoji,
    IsFilename,
} from '@/validation/schemas/common';
import { VALID_USERNAME_FONTS } from '@/validation/schemas/profile';

export class UsernameGradientDTO {
    @ApiProperty()
    @IsBoolean()
    public enabled!: boolean;

    @ApiProperty()
    @IsArray()
    @IsColor({ each: true })
    public colors!: string[];

    @ApiProperty()
    @IsNumber()
    @Min(0)
    @Max(360)
    public angle!: number;
}

export class UsernameGlowDTO {
    @ApiProperty()
    @IsBoolean()
    public enabled!: boolean;

    @ApiProperty()
    @IsColor()
    public color!: string;

    @ApiProperty()
    @IsIntensity()
    public intensity!: number;
}

export class UpdateStatusRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(120)
    public text?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsEmoji()
    public emoji?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsIsoDate()
    public expiresAt?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @IsPositive()
    public expiresInMinutes?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public clear?: boolean;
}

export class BulkStatusRequestDTO {
    @ApiProperty()
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(200)
    public usernames!: string[];
}

export class UpdateStyleRequestDTO {
    @ApiPropertyOptional({ enum: VALID_USERNAME_FONTS })
    @IsOptional()
    @IsIn(VALID_USERNAME_FONTS)
    public usernameFont?: string;

    @ApiPropertyOptional({ type: UsernameGradientDTO })
    @IsOptional()
    @ValidateNested()
    @Type(() => UsernameGradientDTO)
    public usernameGradient?: UsernameGradientDTO;

    @ApiPropertyOptional({ type: UsernameGlowDTO })
    @IsOptional()
    @ValidateNested()
    @Type(() => UsernameGlowDTO)
    public usernameGlow?: UsernameGlowDTO;
}

export class ChangeUsernameRequestDTO {
    @ApiProperty()
    @IsUsername()
    public newUsername!: string;
}

export class UpdateLanguageRequestDTO {
    @ApiProperty()
    @IsString()
    @MinLength(2)
    @MaxLength(10)
    public language!: string;
}

export class UpdateBioRequestDTO {
    @ApiProperty()
    @IsBio()
    public bio!: string;
}

export class UpdatePronounsRequestDTO {
    @ApiProperty()
    @IsString()
    @MaxLength(60)
    @IsOptional()
    public pronouns!: string;
}

export class UpdateDisplayNameRequestDTO {
    @ApiProperty()
    @IsString()
    @MinLength(1)
    @MaxLength(32)
    @IsOptional()
    public displayName!: string;
}

export class AssignBadgesRequestDTO {
    @ApiProperty()
    @IsArray()
    @IsString({ each: true })
    public badgeIds!: string[];
}

export class FilenameParamDTO {
    @ApiProperty()
    @IsFilename()
    public filename!: string;
}
