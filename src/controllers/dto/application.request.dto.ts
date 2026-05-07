import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsNumber,
    IsBoolean,
    IsOptional,
    ValidateNested,
    IsArray,
    MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SlashCommandOptionDTO {
    @ApiProperty()
    @IsNumber()
    public type!: number;

    @ApiProperty()
    @IsString()
    @MaxLength(32)
    public name!: string;

    @ApiProperty()
    @IsString()
    @MaxLength(100)
    public description!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public required?: boolean;
}

export class SetCommandDTO {
    @ApiProperty()
    @IsString()
    @MaxLength(32)
    public name!: string;

    @ApiProperty()
    @IsString()
    @MaxLength(100)
    public description!: string;

    @ApiPropertyOptional({ type: () => [SlashCommandOptionDTO] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SlashCommandOptionDTO)
    public options?: SlashCommandOptionDTO[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public shouldReply?: boolean;
}

export class SetCommandsRequestDTO {
    @ApiProperty({ type: () => [SetCommandDTO] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SetCommandDTO)
    public commands!: SetCommandDTO[];
}
