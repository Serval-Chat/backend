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

export class UsernameGradientDTO {
    @ApiProperty()
    @IsBoolean()
    enabled!: boolean;

    @ApiProperty()
    @IsArray()
    @IsColor({ each: true })
    colors!: string[];

    @ApiProperty()
    @IsNumber()
    @Min(0)
    @Max(360)
    angle!: number;
}

export class UsernameGlowDTO {
    @ApiProperty()
    @IsBoolean()
    enabled!: boolean;

    @ApiProperty()
    @IsColor()
    color!: string;

    @ApiProperty()
    @IsIntensity()
    intensity!: number;
}

export class UpdateStatusRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(120)
    text?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsEmoji()
    emoji?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsIsoDate()
    expiresAt?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @IsPositive()
    expiresInMinutes?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    clear?: boolean;
}

export class BulkStatusRequestDTO {
    @ApiProperty()
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(200)
    usernames!: string[];
}

export class UpdateStyleRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(50)
    usernameFont?: string;

    @ApiPropertyOptional({ type: UsernameGradientDTO })
    @IsOptional()
    @ValidateNested()
    @Type(() => UsernameGradientDTO)
    usernameGradient?: UsernameGradientDTO;

    @ApiPropertyOptional({ type: UsernameGlowDTO })
    @IsOptional()
    @ValidateNested()
    @Type(() => UsernameGlowDTO)
    usernameGlow?: UsernameGlowDTO;
}

export class ChangeUsernameRequestDTO {
    @ApiProperty()
    @IsUsername()
    newUsername!: string;
}

export class UpdateLanguageRequestDTO {
    @ApiProperty()
    @IsString()
    @MinLength(2)
    @MaxLength(10)
    language!: string;
}

export class UpdateBioRequestDTO {
    @ApiProperty()
    @IsBio()
    bio!: string;
}

export class UpdatePronounsRequestDTO {
    @ApiProperty()
    @IsString()
    @MaxLength(60)
    @IsOptional()
    pronouns!: string;
}

export class UpdateDisplayNameRequestDTO {
    @ApiProperty()
    @IsString()
    @MinLength(1)
    @MaxLength(32)
    @IsOptional()
    displayName!: string;
}

export class AssignBadgesRequestDTO {
    @ApiProperty()
    @IsArray()
    @IsString({ each: true })
    badgeIds!: string[];
}

export class FilenameParamDTO {
    @ApiProperty()
    @IsFilename()
    filename!: string;
}
